from __future__ import annotations

from aicut.domain import SelectedClip, TimelineClip, TimelineProject, TimelineTrack


def build_timeline_project(
    project_name: str,
    target_duration_sec: float,
    selected: list[SelectedClip],
) -> TimelineProject:
    cursor = 0.0
    clips: list[TimelineClip] = []
    for item in selected:
        duration = item.duration_sec
        clips.append(
            TimelineClip(
                clip_id=item.candidate.candidate_id,
                asset_id=item.candidate.asset_id,
                source_path=item.candidate.source_path,
                source_start_sec=item.final_start_sec,
                source_end_sec=item.final_end_sec,
                timeline_start_sec=cursor,
                timeline_end_sec=cursor + duration,
                score=item.candidate.score,
                text=item.candidate.text,
                speaker=item.candidate.speaker,
                metadata={
                    "candidate_score": item.candidate.score,
                    "keyword_hits": ",".join(item.candidate.keyword_hits),
                },
            )
        )
        cursor += duration

    return TimelineProject(
        project_name=project_name,
        target_duration_sec=target_duration_sec,
        tracks=[TimelineTrack(track_id="main_v1", name="Main Track", clips=clips)],
        metadata={"track_count": 1, "clip_count": len(clips)},
    )
