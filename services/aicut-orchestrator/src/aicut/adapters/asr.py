from __future__ import annotations

import json
from pathlib import Path

from aicut.config import ASRConfig, AssetConfig
from aicut.domain import TranscriptSegment, WordTiming


def load_whisperx_json(asset: AssetConfig) -> list[TranscriptSegment]:
    if not asset.transcript_path:
        raise ValueError(f"Asset {asset.id} is missing transcript_path for whisperx_json backend.")
    payload = json.loads(Path(asset.transcript_path).read_text(encoding="utf-8"))
    output: list[TranscriptSegment] = []
    for raw_segment in payload.get("segments", []):
        words: list[WordTiming] = []
        for raw_word in raw_segment.get("words", []):
            if raw_word.get("start") is None or raw_word.get("end") is None:
                continue
            words.append(
                WordTiming(
                    start_sec=float(raw_word["start"]) + asset.offset_sec,
                    end_sec=float(raw_word["end"]) + asset.offset_sec,
                    text=str(raw_word.get("word", "")).strip(),
                    speaker=raw_word.get("speaker"),
                )
            )
        output.append(
            TranscriptSegment(
                asset_id=asset.id,
                start_sec=float(raw_segment["start"]) + asset.offset_sec,
                end_sec=float(raw_segment["end"]) + asset.offset_sec,
                text=str(raw_segment.get("text", "")).strip(),
                words=words,
                speaker=raw_segment.get("speaker"),
            )
        )
    return output


class FasterWhisperTranscriber:
    def __init__(self, config: ASRConfig):
        try:
            from faster_whisper import BatchedInferencePipeline, WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "faster-whisper is not installed. Install project dependencies first."
            ) from exc

        base_model = WhisperModel(
            config.model_size,
            device=config.device,
            compute_type=config.compute_type,
        )
        self.config = config
        self._model = (
            BatchedInferencePipeline(model=base_model)
            if config.batch_size
            else base_model
        )

    def transcribe(self, asset: AssetConfig) -> list[TranscriptSegment]:
        kwargs = {
            "beam_size": self.config.beam_size,
            "language": self.config.language,
            "vad_filter": self.config.vad_filter,
            "word_timestamps": self.config.word_timestamps,
        }
        if self.config.batch_size:
            kwargs["batch_size"] = self.config.batch_size
        segments, _info = self._model.transcribe(str(asset.path), **kwargs)
        output: list[TranscriptSegment] = []
        for raw_segment in list(segments):
            words = [
                WordTiming(
                    start_sec=float(word.start) + asset.offset_sec,
                    end_sec=float(word.end) + asset.offset_sec,
                    text=str(word.word).strip(),
                )
                for word in (raw_segment.words or [])
                if word.start is not None and word.end is not None
            ]
            output.append(
                TranscriptSegment(
                    asset_id=asset.id,
                    start_sec=float(raw_segment.start) + asset.offset_sec,
                    end_sec=float(raw_segment.end) + asset.offset_sec,
                    text=str(raw_segment.text).strip(),
                    words=words,
                )
            )
        return output


def transcribe_asset(asset: AssetConfig, config: ASRConfig) -> list[TranscriptSegment]:
    if config.backend == "whisperx_json":
        return load_whisperx_json(asset)
    return FasterWhisperTranscriber(config).transcribe(asset)


def build_asr_runner(config: ASRConfig):
    if config.backend == "whisperx_json":
        return lambda asset: load_whisperx_json(asset)
    transcriber = FasterWhisperTranscriber(config)
    return transcriber.transcribe
