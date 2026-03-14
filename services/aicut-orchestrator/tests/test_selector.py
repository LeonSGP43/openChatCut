from aicut.config import AssemblyConfig
from aicut.domain import CandidateClip, SelectedClip
from aicut.services.selector import select_clips
from aicut.services.timeline import build_timeline_project


def _candidate(name: str, start: float, end: float, score: float) -> CandidateClip:
    candidate = CandidateClip(
        candidate_id=name,
        asset_id="asset",
        source_path="/tmp/asset.mp4",
        order=1,
        soft_start_sec=start,
        soft_end_sec=end,
        hard_start_sec=start,
        hard_end_sec=end,
        text=name,
        words=[],
        speaker=None,
    )
    candidate.score = score
    return candidate


def test_selector_picks_exact_duration_when_available() -> None:
    assembly = AssemblyConfig(
        target_duration_sec=6.0,
        duration_step_ms=100,
        allow_extension_sec=0.0,
        allow_trim_sec=0.0,
    )
    selected = select_clips(
        [
            _candidate("a", 0.0, 2.0, 2.0),
            _candidate("b", 2.0, 6.0, 5.0),
            _candidate("c", 6.0, 10.0, 4.0),
        ],
        assembly,
    )
    assert sum(item.duration_sec for item in selected) == 6.0
    assert [item.candidate.candidate_id for item in selected] == ["a", "b"]


def test_timeline_project_places_clips_sequentially() -> None:
    selected = [
        SelectedClip(candidate=_candidate("a", 1.0, 3.0, 2.0), final_start_sec=1.0, final_end_sec=3.0),
        SelectedClip(candidate=_candidate("b", 5.0, 8.0, 3.0), final_start_sec=5.0, final_end_sec=8.0),
    ]
    project = build_timeline_project("demo", 5.0, selected)
    track = project.tracks[0]
    assert track.clips[0].timeline_start_sec == 0.0
    assert track.clips[0].timeline_end_sec == 2.0
    assert track.clips[1].timeline_start_sec == 2.0
    assert track.clips[1].timeline_end_sec == 5.0


def test_selector_accepts_near_target_duration_within_tolerance() -> None:
    assembly = AssemblyConfig(
        target_duration_sec=8.0,
        target_tolerance_sec=0.05,
        duration_step_ms=100,
        allow_extension_sec=0.0,
        allow_trim_sec=1.0,
    )
    selected = select_clips(
        [
            _candidate("a", 0.0, 1.482, 1.0),
            _candidate("b", 2.0, 3.977, 1.0),
            _candidate("c", 4.0, 5.581, 1.0),
            _candidate("d", 6.0, 7.68, 1.0),
            _candidate("e", 8.0, 9.285, 1.0),
        ],
        assembly,
    )
    total = sum(item.duration_sec for item in selected)
    assert abs(total - 8.0) <= 0.05
