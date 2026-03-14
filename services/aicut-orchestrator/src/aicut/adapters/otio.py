from __future__ import annotations

from pathlib import Path

from aicut.domain import TimelineProject


def write_otio(project: TimelineProject, path: Path) -> None:
    try:
        import opentimelineio as otio
    except ImportError as exc:
        raise RuntimeError(
            "OpenTimelineIO is not installed. Install project dependencies first."
        ) from exc

    timeline = otio.schema.Timeline(name=project.project_name)

    rate = 1000
    for project_track in project.tracks:
        track = otio.schema.Track(name=project_track.name)
        timeline.tracks.append(track)
        for clip in project_track.clips:
            duration_ms = max(1, round(clip.duration_sec * rate))
            start_ms = round(clip.source_start_sec * rate)
            media_ref = otio.schema.ExternalReference(target_url=str(Path(clip.source_path).resolve()))
            item = otio.schema.Clip(
                name=clip.clip_id,
                media_reference=media_ref,
                source_range=otio.opentime.TimeRange(
                    start_time=otio.opentime.RationalTime(start_ms, rate),
                    duration=otio.opentime.RationalTime(duration_ms, rate),
                ),
            )
            track.append(item)

    path.parent.mkdir(parents=True, exist_ok=True)
    otio.adapters.write_to_file(timeline, str(path))
