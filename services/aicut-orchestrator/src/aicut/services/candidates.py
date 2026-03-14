from __future__ import annotations

import itertools

from aicut.config import AssemblyConfig, AssetConfig
from aicut.domain import CandidateClip, SceneSegment, TranscriptSegment


def _scene_for_segment(segment: TranscriptSegment, scenes: list[SceneSegment]) -> SceneSegment | None:
    midpoint = (segment.start_sec + segment.end_sec) / 2
    for scene in scenes:
        if scene.start_sec <= midpoint <= scene.end_sec:
            return scene
    return scenes[0] if scenes else None


def build_candidates(
    asset: AssetConfig,
    transcript_segments: list[TranscriptSegment],
    scenes: list[SceneSegment],
    assembly: AssemblyConfig,
) -> list[CandidateClip]:
    candidates: list[CandidateClip] = []
    min_duration = assembly.min_candidate_duration_sec
    max_duration = assembly.max_candidate_duration_sec

    if transcript_segments:
        for index, segment in enumerate(transcript_segments):
            scene = _scene_for_segment(segment, scenes)
            hard_start = max(
                scene.start_sec if scene else segment.start_sec,
                segment.start_sec - assembly.context_padding_sec,
            )
            hard_end = min(
                scene.end_sec if scene else segment.end_sec,
                segment.end_sec + assembly.context_padding_sec,
            )
            if segment.duration_sec < min_duration:
                continue
            candidates.append(
                CandidateClip(
                    candidate_id=f"{asset.id}-seg-{index:04d}",
                    asset_id=asset.id,
                    source_path=str(asset.path),
                    order=asset.order,
                    soft_start_sec=segment.start_sec,
                    soft_end_sec=segment.end_sec,
                    hard_start_sec=hard_start,
                    hard_end_sec=hard_end,
                    text=segment.text,
                    words=segment.words,
                    speaker=segment.speaker,
                )
            )
    else:
        for index, scene in enumerate(scenes):
            duration = scene.end_sec - scene.start_sec
            if duration < min_duration:
                continue
            scene_end = min(scene.end_sec, scene.start_sec + max_duration)
            candidates.append(
                CandidateClip(
                    candidate_id=f"{asset.id}-scene-{index:04d}",
                    asset_id=asset.id,
                    source_path=str(asset.path),
                    order=asset.order,
                    soft_start_sec=scene.start_sec,
                    soft_end_sec=scene_end,
                    hard_start_sec=scene.start_sec,
                    hard_end_sec=min(scene.end_sec, scene.start_sec + max_duration),
                    text="",
                    words=[],
                    speaker=None,
                )
            )

    candidates.sort(key=lambda item: (item.order, item.soft_start_sec, item.soft_end_sec))
    # Keep only naturally bounded single-segment candidates for the MVP to avoid overlap complexity.
    return list(itertools.islice(candidates, 0, None))
