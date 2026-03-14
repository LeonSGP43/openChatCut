from __future__ import annotations

from collections import defaultdict

from aicut.config import DiarizationConfig
from aicut.domain import TranscriptSegment


class PyannoteDiarizer:
    def __init__(self, config: DiarizationConfig):
        if not config.enabled:
            raise ValueError("Diarization is disabled.")
        try:
            import torch
            from pyannote.audio import Pipeline
        except ImportError as exc:
            raise RuntimeError(
                "pyannote.audio is not installed. Install with the diarization extra."
            ) from exc

        self._torch = torch
        self._pipeline = Pipeline.from_pretrained(config.model_name, token=config.token)
        self._pipeline.to(torch.device(config.device))

    def run(self, audio_path: str) -> list[tuple[float, float, str]]:
        annotation = self._pipeline(audio_path)
        return [
            (float(turn.start), float(turn.end), str(speaker))
            for turn, speaker in annotation.speaker_diarization
        ]


def assign_speakers(
    transcript_segments: list[TranscriptSegment],
    diarization_turns: list[tuple[float, float, str]],
) -> list[TranscriptSegment]:
    for segment in transcript_segments:
        speaker_scores: dict[str, float] = defaultdict(float)
        for turn_start, turn_end, speaker in diarization_turns:
            overlap = min(segment.end_sec, turn_end) - max(segment.start_sec, turn_start)
            if overlap > 0:
                speaker_scores[speaker] += overlap
        if speaker_scores:
            segment.speaker = max(speaker_scores, key=speaker_scores.get)
            for word in segment.words:
                word.speaker = segment.speaker
    return transcript_segments
