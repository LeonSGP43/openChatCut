from __future__ import annotations

from aicut.config import AssetConfig, SceneConfig
from aicut.domain import SceneSegment, TranscriptSegment


def detect_scenes(
    asset: AssetConfig,
    config: SceneConfig,
    transcript_segments: list[TranscriptSegment],
) -> list[SceneSegment]:
    try:
        from scenedetect import ContentDetector, detect
    except ImportError as exc:
        raise RuntimeError(
            "scenedetect is not installed. Install project dependencies first."
        ) from exc

    raw_scenes = detect(str(asset.path), ContentDetector(threshold=config.threshold))
    scenes = [
        SceneSegment(
            asset_id=asset.id,
            start_sec=float(start.get_seconds()) + asset.offset_sec,
            end_sec=float(end.get_seconds()) + asset.offset_sec,
        )
        for start, end in raw_scenes
    ]
    if scenes:
        return scenes

    if transcript_segments:
        return [
            SceneSegment(
                asset_id=asset.id,
                start_sec=transcript_segments[0].start_sec,
                end_sec=transcript_segments[-1].end_sec,
            )
        ]
    return []
