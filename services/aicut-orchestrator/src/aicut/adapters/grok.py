from __future__ import annotations

import hashlib
import json
import re
import ssl
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib import error, request

from rich.console import Console

from aicut.config import AssetConfig, BuildConfig, GrokAnalysisConfig
from aicut.domain import CandidateClip

GROK_RESPONSE_SCHEMA = {
    "semantic_score": "number 0-10",
    "summary": "string, one sentence",
    "tags": "array of short strings",
}
XAI_TOOL_USAGE_CARD_RE = re.compile(
    r"<xai:tool_usage_card>.*?</xai:tool_usage_card>",
    flags=re.DOTALL | re.IGNORECASE,
)
XMLISH_TAG_RE = re.compile(r"</?xai:[^>]+>", flags=re.IGNORECASE)


@dataclass(slots=True)
class GrokClipInsight:
    semantic_score: float
    summary: str
    tags: list[str]


@dataclass(slots=True)
class GrokFailureCacheEntry:
    error: str
    expires_at: str


def _join_url(base_url: str, api_path: str) -> str:
    return f"{base_url.rstrip('/')}/{api_path.lstrip('/')}"


def _extract_response_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    output = payload.get("output")
    if not isinstance(output, list):
        return ""

    text_parts: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "output_text" and isinstance(part.get("text"), str):
                text_parts.append(part["text"])
    return "\n".join(text_parts).strip()


def clean_grok_response_text(text: str) -> str:
    cleaned = text.strip()
    cleaned = XAI_TOOL_USAGE_CARD_RE.sub("", cleaned)
    cleaned = XMLISH_TAG_RE.sub("", cleaned)
    return cleaned.strip()


def _parse_json_object(text: str) -> dict[str, Any]:
    cleaned = clean_grok_response_text(text)
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        pass

    brace_starts = [index for index, char in enumerate(cleaned) if char == "{"]
    brace_ends = [index for index, char in enumerate(cleaned) if char == "}"]
    if not brace_starts or not brace_ends:
        return {}

    # Prefer the last valid JSON object because Grok may prepend explanations or tool cards.
    for start in reversed(brace_starts):
        for end in reversed(brace_ends):
            if end <= start:
                continue
            snippet = cleaned[start : end + 1]
            try:
                parsed = json.loads(snippet)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
    return {}


def _coerce_tags(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    tags: list[str] = []
    for item in value:
        text = str(item).strip()
        if text:
            tags.append(text)
    return tags[:6]


def parse_grok_insight_payload(payload: dict[str, Any]) -> GrokClipInsight:
    text = clean_grok_response_text(_extract_response_text(payload))
    parsed = _parse_json_object(text)
    semantic_score = parsed.get("semantic_score", parsed.get("score", 0.0))
    try:
        normalized_score = float(semantic_score)
    except (TypeError, ValueError):
        normalized_score = 0.0
    normalized_score = max(0.0, min(10.0, normalized_score))

    summary = parsed.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        summary = text[:240].strip()

    return GrokClipInsight(
        semantic_score=normalized_score,
        summary=summary.strip(),
        tags=_coerce_tags(parsed.get("tags")),
    )


class GrokCandidateAnalyzer:
    def __init__(self, config: GrokAnalysisConfig):
        self.config = config
        if not config.api_key:
            raise RuntimeError("Grok analysis is enabled but AICUT_GROK_API_KEY is not set.")
        self.url = _join_url(config.base_url, config.api_path)
        self.ssl_context = _build_ssl_context()

    def analyze_asset_candidates(
        self,
        candidates: list[CandidateClip],
        asset: AssetConfig,
        build_config: BuildConfig,
        cache_dir: Path | None = None,
        console: Console | None = None,
    ) -> None:
        ranked = sorted(candidates, key=lambda item: item.score, reverse=True)
        if self.config.max_candidates_per_asset is not None:
            ranked = ranked[: self.config.max_candidates_per_asset]

        with ThreadPoolExecutor(max_workers=max(1, self.config.max_concurrency)) as executor:
            future_map = {
                executor.submit(self._analyze_candidate, candidate, asset, build_config, cache_dir): candidate
                for candidate in ranked
            }
            for future in as_completed(future_map):
                candidate = future_map[future]
                try:
                    insight = future.result()
                except Exception as exc:
                    if console:
                        console.print(
                            f"[yellow]Grok analysis failed[/yellow] {candidate.candidate_id}: {exc}"
                        )
                    continue
                candidate.grok_score = insight.semantic_score
                candidate.grok_summary = insight.summary
                candidate.grok_tags = insight.tags

    def _analyze_candidate(
        self,
        candidate: CandidateClip,
        asset: AssetConfig,
        build_config: BuildConfig,
        cache_dir: Path | None = None,
    ) -> GrokClipInsight:
        prompt = self._build_prompt(candidate, asset, build_config)
        cache_path = self._cache_path(prompt, cache_dir)
        failure_cache_path = self._failure_cache_path(prompt, cache_dir)
        if cache_path and cache_path.exists():
            return parse_grok_insight_payload(json.loads(cache_path.read_text(encoding="utf-8")))
        self._raise_if_failure_cache_active(failure_cache_path)

        payload = {
            "model": self.config.model,
            "input": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": prompt,
                        }
                    ],
                }
            ],
            "instructions": self.config.instructions,
            "max_output_tokens": self.config.max_output_tokens,
            "reasoning": {"effort": self.config.reasoning_effort},
            "tool_choice": "none",
            "parallel_tool_calls": False,
            "stream": False,
        }
        body = json.dumps(payload, ensure_ascii=False)
        try:
            raw_payload = self._fetch_with_retry(body)
        except Exception as exc:
            if failure_cache_path:
                failure_cache_path.parent.mkdir(parents=True, exist_ok=True)
                expires_at = datetime.now(timezone.utc) + timedelta(seconds=self.config.failure_cache_ttl_sec)
                failure_cache_path.write_text(
                    json.dumps(
                        {
                            "error": str(exc),
                            "expires_at": expires_at.isoformat(),
                        },
                        ensure_ascii=False,
                        indent=2,
                    ),
                    encoding="utf-8",
                )
            raise

        if cache_path:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(json.dumps(raw_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        if failure_cache_path and failure_cache_path.exists():
            failure_cache_path.unlink()
        return parse_grok_insight_payload(raw_payload)

    def _fetch_payload(self, body: str) -> dict[str, Any]:
        curl_result = self._post_with_curl(body)
        if curl_result is not None:
            return curl_result

        body_bytes = body.encode("utf-8")
        req = request.Request(
            self.url,
            data=body_bytes,
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=self.config.timeout_sec, context=self.ssl_context) as response:
                raw = response.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
        except error.URLError as exc:
            raise RuntimeError(f"Connection failed: {exc.reason}") from exc

        return json.loads(raw)

    def _fetch_with_retry(self, body: str) -> dict[str, Any]:
        attempts = max(1, self.config.retry_attempts + 1)
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return self._fetch_payload(body)
            except Exception as exc:
                last_error = exc
                if attempt >= attempts or not self._is_retryable_error(exc):
                    break
                time.sleep(self.config.retry_backoff_sec * attempt)
        assert last_error is not None
        raise last_error

    def _build_prompt(
        self,
        candidate: CandidateClip,
        asset: AssetConfig,
        build_config: BuildConfig,
    ) -> str:
        keywords = ", ".join(build_config.global_keywords + asset.keywords) or "none"
        instruction = build_config.edit_instruction or "none"
        return (
            "You are scoring a candidate clip for automated highlight editing.\n"
            "Return exactly one JSON object and no markdown, no XML, no prose, no tool notes.\n"
            f"Return schema: {json.dumps(GROK_RESPONSE_SCHEMA, ensure_ascii=False)}\n"
            "Rules:\n"
            "- semantic_score must be a number from 0 to 10\n"
            "- summary must be exactly one concise sentence\n"
            "- tags must contain 1 to 6 short strings\n"
            "- Judge narrative value, emotional pull, clarity, payoff, and edit usefulness\n"
            "- Penalize filler, repetition, weak setup without payoff, and confusing speech\n"
            "- Use only the provided clip context\n\n"
            f"Project: {build_config.project_name}\n"
            f"Edit instruction: {instruction}\n"
            f"Asset id: {asset.id}\n"
            f"Candidate id: {candidate.candidate_id}\n"
            f"Clip window: {candidate.soft_start_sec:.2f}-{candidate.soft_end_sec:.2f} sec\n"
            f"Duration: {candidate.duration_sec:.2f} sec\n"
            f"Keywords: {keywords}\n"
            f"Transcript:\n{candidate.text or '[no transcript available]'}\n"
        )

    def _post_with_curl(self, body: str) -> dict[str, Any] | None:
        marker = "__AICUT_HTTP_STATUS__:"
        cmd = [
            "curl",
            "-sS",
            "--http1.1",
            "-X",
            "POST",
            self.url,
            "-H",
            f"Authorization: Bearer {self.config.api_key}",
            "-H",
            "Content-Type: application/json",
            "--data",
            body,
            "-w",
            f"\n{marker}%{{http_code}}",
        ]
        try:
            completed = subprocess.run(
                cmd,
                check=False,
                capture_output=True,
                text=True,
                timeout=self.config.timeout_sec,
            )
        except Exception:
            return None

        if completed.returncode != 0:
            return None

        stdout = completed.stdout or ""
        if marker not in stdout:
            return None
        raw_body, status_part = stdout.rsplit(marker, 1)
        status_text = status_part.strip()
        if not status_text.isdigit():
            return None
        status = int(status_text)
        if status < 200 or status >= 300:
            raise RuntimeError(f"HTTP {status}: {raw_body.strip()}")
        return json.loads(raw_body)

    def _cache_path(self, prompt: str, cache_dir: Path | None) -> Path | None:
        if not self.config.cache_enabled or cache_dir is None:
            return None
        digest = hashlib.sha256(
            json.dumps(
                {
                    "prompt_version": self.config.prompt_version,
                    "model": self.config.model,
                    "instructions": self.config.instructions,
                    "prompt": prompt,
                },
                ensure_ascii=False,
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        return cache_dir / "grok" / f"{digest}.json"

    def _failure_cache_path(self, prompt: str, cache_dir: Path | None) -> Path | None:
        success_path = self._cache_path(prompt, cache_dir)
        if success_path is None:
            return None
        return success_path.with_suffix(".failed.json")

    def _raise_if_failure_cache_active(self, failure_cache_path: Path | None) -> None:
        if failure_cache_path is None or not failure_cache_path.exists():
            return
        try:
            payload = json.loads(failure_cache_path.read_text(encoding="utf-8"))
            expires_at = datetime.fromisoformat(str(payload.get("expires_at")))
        except Exception:
            failure_cache_path.unlink(missing_ok=True)
            return

        now = datetime.now(timezone.utc)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            failure_cache_path.unlink(missing_ok=True)
            return

        error_message = str(payload.get("error") or "recent Grok failure is still cached")
        raise RuntimeError(f"Grok failure cache active until {expires_at.isoformat()}: {error_message}")

    def _is_retryable_error(self, exc: Exception) -> bool:
        text = str(exc).lower()
        retryable_markers = [
            "http 429",
            "http 500",
            "http 502",
            "http 503",
            "http 504",
            "timed out",
            "timeout",
            "connection failed",
        ]
        return any(marker in text for marker in retryable_markers)


def _build_ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()
