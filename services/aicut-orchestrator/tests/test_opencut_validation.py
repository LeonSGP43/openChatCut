import json
import zipfile

import pytest

from aicut.adapters import opencut as opencut_adapter
from aicut.adapters.opencut import write_opencut_bundle
from aicut.config import AssemblyConfig, BuildConfig
from aicut.domain import CandidateClip, SelectedClip
from aicut.services.timeline import build_timeline_project


def _candidate(
    candidate_id: str,
    asset_id: str,
    source_path: str,
    start: float,
    end: float,
    score: float,
) -> CandidateClip:
    candidate = CandidateClip(
        candidate_id=candidate_id,
        asset_id=asset_id,
        source_path=source_path,
        order=1,
        soft_start_sec=start,
        soft_end_sec=end,
        hard_start_sec=start,
        hard_end_sec=end,
        text=candidate_id,
        words=[],
        speaker=None,
    )
    candidate.score = score
    return candidate


def _build_three_clip_project(tmp_path, target_duration_sec: float):
    durations = [
        round(target_duration_sec * 0.25, 3),
        round(target_duration_sec * 0.35, 3),
    ]
    durations.append(round(target_duration_sec - durations[0] - durations[1], 3))

    sources = []
    for index in range(3):
        source = tmp_path / f"video-{index}.mp4"
        source.write_bytes(f"fake-video-{index}".encode("utf-8"))
        sources.append(source)

    starts = [2.0, 10.0, 20.0]
    selected = []
    expected = []
    for index, duration in enumerate(durations):
        start = starts[index]
        end = start + duration
        clip_id = f"clip-{index + 1}"
        asset_id = f"asset-{index + 1}"
        selected.append(
            SelectedClip(
                candidate=_candidate(
                    clip_id,
                    asset_id,
                    str(sources[index]),
                    start,
                    end,
                    score=2.0 + index,
                ),
                final_start_sec=start,
                final_end_sec=end,
            )
        )
        expected.append(
            {
                "clip_id": clip_id,
                "asset_id": asset_id,
                "trim_start": start,
                "trim_end": 90.0 - end,
            }
        )

    project = build_timeline_project(f"demo-{int(target_duration_sec)}s", target_duration_sec, selected)
    return project, expected


@pytest.mark.parametrize("target_duration_sec", [15.0, 30.0, 60.0])
def test_opencut_bundle_validation_for_15_30_60_second_projects(
    tmp_path,
    monkeypatch,
    target_duration_sec: float,
) -> None:
    monkeypatch.setattr(opencut_adapter, "_probe_duration", lambda _path: 90.0)
    project, expected = _build_three_clip_project(tmp_path, target_duration_sec)
    config = BuildConfig(
        project_name=project.project_name,
        assets=[],
        assembly=AssemblyConfig(target_duration_sec=target_duration_sec),
    )
    bundle_path = tmp_path / f"demo-{int(target_duration_sec)}.opencut"
    write_opencut_bundle(project, config, bundle_path)

    with zipfile.ZipFile(bundle_path, "r") as archive:
        names = set(archive.namelist())
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        payload = json.loads(archive.read("project.json").decode("utf-8"))

    # no missing media after import
    assert all(asset["bundledFile"] in names for asset in manifest["assets"])

    # clip order preserved
    elements = payload["scenes"][0]["tracks"][0]["elements"]
    assert [element["name"] for element in elements] == [item["clip_id"] for item in expected]

    # trim boundaries preserved
    for element, item in zip(elements, expected):
        assert element["mediaId"] == item["asset_id"]
        assert element["trimStart"] == pytest.approx(item["trim_start"], abs=1e-6)
        assert element["trimEnd"] == pytest.approx(item["trim_end"], abs=1e-6)

    # project FPS and canvas settings preserved
    assert payload["settings"]["fps"] == 30
    assert payload["settings"]["canvasSize"] == {"width": 1920, "height": 1080}

    # duration preserved for 15 / 30 / 60 second projects
    assert payload["metadata"]["duration"] == pytest.approx(target_duration_sec, abs=1e-6)
