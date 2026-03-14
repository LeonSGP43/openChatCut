import json
from pathlib import Path
import time

from aicut.config import AssemblyConfig, BuildConfig, GrokAnalysisConfig
from aicut.domain import CandidateClip
from aicut.services.scoring import apply_grok_score, score_candidate
from aicut.adapters.grok import GrokCandidateAnalyzer, clean_grok_response_text, parse_grok_insight_payload


def _candidate() -> CandidateClip:
    return CandidateClip(
        candidate_id="asset-1-seg-0001",
        asset_id="asset-1",
        source_path="/tmp/demo.mp4",
        order=1,
        soft_start_sec=1.0,
        soft_end_sec=5.0,
        hard_start_sec=0.8,
        hard_end_sec=5.2,
        text="Big reveal moment with an excited reaction and clear product benefit.",
        words=[],
        speaker=None,
    )


def test_parse_grok_insight_payload_reads_output_text_json() -> None:
    payload = {
        "output_text": json.dumps(
            {
                "semantic_score": 8.5,
                "summary": "Strong reveal moment with clear payoff.",
                "tags": ["reveal", "reaction"],
            }
        )
    }

    insight = parse_grok_insight_payload(payload)

    assert insight.semantic_score == 8.5
    assert insight.summary == "Strong reveal moment with clear payoff."
    assert insight.tags == ["reveal", "reaction"]


def test_parse_grok_insight_payload_tolerates_preface_and_tool_card_noise() -> None:
    payload = {
        "output_text": (
            'Understanding request\\n<xai:tool_usage_card>{"message":"internal"}</xai:tool_usage_card>'
            '{"semantic_score":7.2,"summary":"Useful result-focused moment.","tags":["result","product"]}'
        )
    }

    insight = parse_grok_insight_payload(payload)

    assert insight.semantic_score == 7.2
    assert insight.summary == "Useful result-focused moment."
    assert insight.tags == ["result", "product"]


def test_clean_grok_response_text_removes_xai_tool_usage_card_block() -> None:
    raw = (
        'Before\n'
        '<xai:tool_usage_card>\n'
        '  <xai:tool_usage_card_id>abc</xai:tool_usage_card_id>\n'
        '  <xai:tool_name>chatroom_send</xai:tool_name>\n'
        '</xai:tool_usage_card>\n'
        '{"semantic_score":6.0,"summary":"Clean.","tags":["ok"]}'
    )

    cleaned = clean_grok_response_text(raw)

    assert "tool_usage_card" not in cleaned
    assert "chatroom_send" not in cleaned
    assert cleaned.endswith('{"semantic_score":6.0,"summary":"Clean.","tags":["ok"]}')


def test_apply_grok_score_adds_semantic_bonus() -> None:
    candidate = _candidate()
    config = BuildConfig(
        project_name="demo",
        assets=[],
        assembly=AssemblyConfig(target_duration_sec=10.0),
    )
    asset = type("Asset", (), {"weight": 1.0, "keywords": []})()

    score_candidate(candidate, asset, config)
    base_score = candidate.score
    candidate.grok_score = 8.0

    apply_grok_score(candidate, config)

    assert candidate.score > base_score
    assert candidate.score_breakdown["grok_bonus"] == 2.8


def test_grok_cache_hit_avoids_repeat_request(tmp_path: Path) -> None:
    candidate = _candidate()
    build_config = BuildConfig(
        project_name="demo",
        assets=[],
        assembly=AssemblyConfig(target_duration_sec=10.0),
        grok=GrokAnalysisConfig(api_key="test-key"),
    )
    asset = type("Asset", (), {"id": "asset-1", "keywords": []})()
    analyzer = GrokCandidateAnalyzer(build_config.grok)
    prompt = analyzer._build_prompt(candidate, asset, build_config)
    cache_path = analyzer._cache_path(prompt, tmp_path)
    assert cache_path is not None
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps(
            {
                "output_text": json.dumps(
                    {
                        "semantic_score": 9.0,
                        "summary": "Cached hit.",
                        "tags": ["cached"],
                    }
                )
            }
        ),
        encoding="utf-8",
    )

    def _fail_fetch(_body: str):
        raise AssertionError("network should not be called when Grok cache hits")

    analyzer._fetch_payload = _fail_fetch  # type: ignore[method-assign]

    insight = analyzer._analyze_candidate(candidate, asset, build_config, tmp_path)

    assert insight.semantic_score == 9.0
    assert insight.summary == "Cached hit."
    assert insight.tags == ["cached"]


def test_grok_failure_cache_skips_repeat_request_until_ttl_expires(tmp_path: Path) -> None:
    candidate = _candidate()
    build_config = BuildConfig(
        project_name="demo",
        assets=[],
        assembly=AssemblyConfig(target_duration_sec=10.0),
        grok=GrokAnalysisConfig(api_key="test-key"),
    )
    asset = type("Asset", (), {"id": "asset-1", "keywords": []})()
    analyzer = GrokCandidateAnalyzer(build_config.grok)
    prompt = analyzer._build_prompt(candidate, asset, build_config)
    failure_cache_path = analyzer._failure_cache_path(prompt, tmp_path)
    assert failure_cache_path is not None
    failure_cache_path.parent.mkdir(parents=True, exist_ok=True)
    failure_cache_path.write_text(
        json.dumps(
            {
                "error": "HTTP 503: upstream unavailable",
                "expires_at": "2999-01-01T00:00:00+00:00",
            }
        ),
        encoding="utf-8",
    )

    def _fail_fetch(_body: str):
        raise AssertionError("network should not be called when failure cache is active")

    analyzer._fetch_with_retry = _fail_fetch  # type: ignore[method-assign]

    try:
        analyzer._analyze_candidate(candidate, asset, build_config, tmp_path)
    except RuntimeError as exc:
        assert "failure cache active" in str(exc).lower()
    else:
        raise AssertionError("expected active failure cache to raise")


def test_grok_retry_recovers_from_transient_error(monkeypatch, tmp_path: Path) -> None:
    candidate = _candidate()
    build_config = BuildConfig(
        project_name="demo",
        assets=[],
        assembly=AssemblyConfig(target_duration_sec=10.0),
        grok=GrokAnalysisConfig(api_key="test-key", retry_attempts=2, retry_backoff_sec=0.01),
    )
    asset = type("Asset", (), {"id": "asset-1", "keywords": []})()
    analyzer = GrokCandidateAnalyzer(build_config.grok)
    calls = {"count": 0}

    def _fake_fetch(_body: str):
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("HTTP 503: upstream unavailable")
        return {
            "output_text": json.dumps(
                {
                    "semantic_score": 7.5,
                    "summary": "Recovered after retry.",
                    "tags": ["retry"],
                }
            )
        }

    monkeypatch.setattr(analyzer, "_fetch_payload", _fake_fetch)
    monkeypatch.setattr(time, "sleep", lambda _seconds: None)

    insight = analyzer._analyze_candidate(candidate, asset, build_config, tmp_path)

    assert calls["count"] == 2
    assert insight.semantic_score == 7.5
    assert insight.summary == "Recovered after retry."
    assert insight.tags == ["retry"]
