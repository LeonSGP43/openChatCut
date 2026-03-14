from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(slots=True)
class WordTiming:
    start_sec: float
    end_sec: float
    text: str
    speaker: str | None = None


@dataclass(slots=True)
class TranscriptSegment:
    asset_id: str
    start_sec: float
    end_sec: float
    text: str
    words: list[WordTiming] = field(default_factory=list)
    speaker: str | None = None

    @property
    def duration_sec(self) -> float:
        return max(0.0, self.end_sec - self.start_sec)


@dataclass(slots=True)
class SceneSegment:
    asset_id: str
    start_sec: float
    end_sec: float


@dataclass(slots=True)
class CandidateClip:
    candidate_id: str
    asset_id: str
    source_path: str
    order: int
    soft_start_sec: float
    soft_end_sec: float
    hard_start_sec: float
    hard_end_sec: float
    text: str
    words: list[WordTiming]
    speaker: str | None
    score: float = 0.0
    score_breakdown: dict[str, float] = field(default_factory=dict)
    keyword_hits: list[str] = field(default_factory=list)
    grok_score: float = 0.0
    grok_summary: str = ""
    grok_tags: list[str] = field(default_factory=list)

    @property
    def duration_sec(self) -> float:
        return max(0.0, self.soft_end_sec - self.soft_start_sec)

    @property
    def max_extension_sec(self) -> float:
        return max(0.0, self.hard_end_sec - self.soft_end_sec)

    @property
    def max_leading_extension_sec(self) -> float:
        return max(0.0, self.soft_start_sec - self.hard_start_sec)

    def as_dict(self) -> dict:
        payload = asdict(self)
        payload["duration_sec"] = self.duration_sec
        return payload


@dataclass(slots=True)
class SelectedClip:
    candidate: CandidateClip
    final_start_sec: float
    final_end_sec: float

    @property
    def duration_sec(self) -> float:
        return max(0.0, self.final_end_sec - self.final_start_sec)

    def as_dict(self) -> dict:
        return {
            "candidate_id": self.candidate.candidate_id,
            "asset_id": self.candidate.asset_id,
            "final_start_sec": self.final_start_sec,
            "final_end_sec": self.final_end_sec,
            "duration_sec": self.duration_sec,
            "score": self.candidate.score,
            "text": self.candidate.text,
        }


@dataclass(slots=True)
class TimelineClip:
    clip_id: str
    asset_id: str
    source_path: str
    source_start_sec: float
    source_end_sec: float
    timeline_start_sec: float
    timeline_end_sec: float
    score: float
    text: str = ""
    speaker: str | None = None
    metadata: dict[str, str | float | int | None] = field(default_factory=dict)

    @property
    def duration_sec(self) -> float:
        return max(0.0, self.timeline_end_sec - self.timeline_start_sec)

    def as_dict(self) -> dict:
        payload = asdict(self)
        payload["duration_sec"] = self.duration_sec
        return payload


@dataclass(slots=True)
class TimelineTrack:
    track_id: str
    name: str
    clips: list[TimelineClip] = field(default_factory=list)

    @property
    def duration_sec(self) -> float:
        if not self.clips:
            return 0.0
        return max(clip.timeline_end_sec for clip in self.clips)

    def as_dict(self) -> dict:
        return {
            "track_id": self.track_id,
            "name": self.name,
            "duration_sec": self.duration_sec,
            "clips": [clip.as_dict() for clip in self.clips],
        }


@dataclass(slots=True)
class TimelineProject:
    project_name: str
    target_duration_sec: float
    tracks: list[TimelineTrack]
    metadata: dict[str, str | float | int | None] = field(default_factory=dict)

    @property
    def duration_sec(self) -> float:
        if not self.tracks:
            return 0.0
        return max(track.duration_sec for track in self.tracks)

    def as_dict(self) -> dict:
        return {
            "project_name": self.project_name,
            "target_duration_sec": self.target_duration_sec,
            "duration_sec": self.duration_sec,
            "metadata": self.metadata,
            "tracks": [track.as_dict() for track in self.tracks],
        }
