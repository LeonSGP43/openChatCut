from __future__ import annotations

import math

from aicut.config import AssetConfig, BuildConfig
from aicut.domain import CandidateClip


def score_candidate(
    candidate: CandidateClip,
    asset: AssetConfig,
    config: BuildConfig,
) -> CandidateClip:
    keywords = {item.lower() for item in config.global_keywords + asset.keywords}
    text_lc = candidate.text.lower()
    hits = [keyword for keyword in keywords if keyword in text_lc]

    word_count = len(candidate.words)
    duration = max(candidate.duration_sec, 0.001)
    speech_density = word_count / duration
    punctuation_bonus = 0.5 if any(mark in candidate.text for mark in ("!", "?", ":", " - ")) else 0.0
    speaker_bonus = 0.4 if candidate.speaker else 0.0
    duration_center = (config.assembly.min_candidate_duration_sec + config.assembly.max_candidate_duration_sec) / 2
    duration_bonus = max(0.0, 1 - abs(duration - duration_center) / max(duration_center, 0.001))

    breakdown = {
        "asset_weight": asset.weight,
        "keyword_hits": len(hits) * 2.0,
        "speech_density": min(3.0, speech_density * 0.15),
        "duration_bonus": duration_bonus,
        "punctuation_bonus": punctuation_bonus,
        "speaker_bonus": speaker_bonus,
        "has_text_bonus": 0.6 if candidate.text else 0.0,
        "brevity_penalty": -1.0 if duration < config.assembly.min_candidate_duration_sec else 0.0,
    }
    candidate.keyword_hits = hits
    candidate.score_breakdown = breakdown
    candidate.score = round(math.fsum(breakdown.values()), 4)
    return candidate


def apply_grok_score(candidate: CandidateClip, config: BuildConfig) -> CandidateClip:
    grok_bonus = round(max(0.0, candidate.grok_score) * config.grok.score_weight, 4)
    candidate.score_breakdown["grok_bonus"] = grok_bonus
    candidate.score = round(math.fsum(candidate.score_breakdown.values()), 4)
    return candidate
