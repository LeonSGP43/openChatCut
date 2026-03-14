from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field


class AssetConfig(BaseModel):
    id: str
    path: Path
    transcript_path: Path | None = None
    order: int = 0
    weight: float = 1.0
    offset_sec: float = 0.0
    keywords: list[str] = Field(default_factory=list)


class ASRConfig(BaseModel):
    backend: Literal["faster_whisper", "whisperx_json"] = "faster_whisper"
    model_size: str = "small"
    device: str = "cpu"
    compute_type: str = "int8"
    language: str | None = None
    beam_size: int = 5
    batch_size: int | None = None
    vad_filter: bool = True
    word_timestamps: bool = True


class DiarizationConfig(BaseModel):
    enabled: bool = False
    model_name: str = "pyannote/speaker-diarization-community-1"
    token: str | None = None
    device: str = "cpu"


class GrokAnalysisConfig(BaseModel):
    enabled: bool = False
    base_url: str = Field(default_factory=lambda: os.getenv("AICUT_GROK_BASE_URL", "http://127.0.0.1:3000"))
    api_path: str = "/grokcodex41thinking/v1/responses"
    api_key: str | None = Field(default_factory=lambda: os.getenv("AICUT_GROK_API_KEY"))
    model: str = Field(default_factory=lambda: os.getenv("AICUT_GROK_MODEL", "grok-4.1-thinking"))
    cache_enabled: bool = True
    prompt_version: str = "v1"
    retry_attempts: int = 2
    retry_backoff_sec: float = 1.0
    failure_cache_ttl_sec: int = int(timedelta(minutes=10).total_seconds())
    max_concurrency: int = 4
    max_candidates_per_asset: int | None = 24
    timeout_sec: float = 90.0
    max_output_tokens: int = 500
    reasoning_effort: Literal["low", "medium", "high"] = "high"
    score_weight: float = 0.35
    instructions: str = (
        "You are analyzing highlight candidates for short-form video editing. "
        "Score clips by narrative value, emotional pull, clarity, and usefulness in a concise edit."
    )


class SceneConfig(BaseModel):
    threshold: float = 27.0


class AssemblyConfig(BaseModel):
    target_duration_sec: float
    target_tolerance_sec: float = 0.05
    min_candidate_duration_sec: float = 1.0
    max_candidate_duration_sec: float = 8.0
    context_padding_sec: float = 0.25
    duration_step_ms: int = 100
    allow_extension_sec: float = 0.4
    allow_trim_sec: float = 0.6
    min_selected_clips: int = 1


class OutputConfig(BaseModel):
    directory: Path = Path("./output")
    filename: str = "final_cut.mp4"
    write_otio: bool = True
    write_opencut_bundle: bool = True
    write_opencut_project: bool = True
    write_manifest: bool = True
    write_srt: bool = True


class BuildConfig(BaseModel):
    project_name: str = "aicut-build"
    edit_instruction: str | None = None
    global_keywords: list[str] = Field(default_factory=list)
    assets: list[AssetConfig]
    asr: ASRConfig = Field(default_factory=ASRConfig)
    diarization: DiarizationConfig = Field(default_factory=DiarizationConfig)
    grok: GrokAnalysisConfig = Field(default_factory=GrokAnalysisConfig)
    scenes: SceneConfig = Field(default_factory=SceneConfig)
    assembly: AssemblyConfig
    output: OutputConfig = Field(default_factory=OutputConfig)

    @classmethod
    def load(cls, path: str | Path) -> "BuildConfig":
        with Path(path).open("r", encoding="utf-8") as handle:
            raw = yaml.safe_load(handle)
        return cls.model_validate(raw)
