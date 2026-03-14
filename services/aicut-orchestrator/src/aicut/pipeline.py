from __future__ import annotations

import json
from pathlib import Path

from rich.console import Console

from aicut.adapters.asr import build_asr_runner
from aicut.adapters.diarization import PyannoteDiarizer, assign_speakers
from aicut.adapters.grok import GrokCandidateAnalyzer
from aicut.adapters.opencut import write_opencut_bundle, write_opencut_project
from aicut.adapters.otio import write_otio
from aicut.adapters.render import extract_and_concat
from aicut.adapters.scenes import detect_scenes
from aicut.config import BuildConfig
from aicut.domain import CandidateClip, TimelineProject
from aicut.services.candidates import build_candidates
from aicut.services.scoring import apply_grok_score, score_candidate
from aicut.services.selector import select_clips
from aicut.services.timeline import build_timeline_project


class BuildPipeline:
    def __init__(self, config: BuildConfig, console: Console | None = None):
        self.config = config
        self.console = console or Console()

    def run(self) -> Path:
        output_dir = self.config.output.directory
        cache_dir = output_dir / ".cache"
        temp_dir = output_dir / ".tmp"
        output_dir.mkdir(parents=True, exist_ok=True)
        cache_dir.mkdir(parents=True, exist_ok=True)

        diarizer = None
        if self.config.diarization.enabled:
            diarizer = PyannoteDiarizer(self.config.diarization)
        asr_runner = build_asr_runner(self.config.asr)
        grok_analyzer = GrokCandidateAnalyzer(self.config.grok) if self.config.grok.enabled else None

        all_candidates: list[CandidateClip] = []

        for asset in sorted(self.config.assets, key=lambda item: item.order):
            self.console.print(f"[bold]Processing asset[/bold] {asset.id}: {asset.path}")
            transcript_segments = asr_runner(asset)
            if diarizer and transcript_segments:
                turns = diarizer.run(str(asset.path))
                transcript_segments = assign_speakers(transcript_segments, turns)

            scenes = detect_scenes(asset, self.config.scenes, transcript_segments)
            candidates = build_candidates(asset, transcript_segments, scenes, self.config.assembly)
            scored = [score_candidate(candidate, asset, self.config) for candidate in candidates]
            if grok_analyzer and scored:
                self.console.print(f"[bold]Grok analysis[/bold] {asset.id}: semantic scoring on top candidates")
                grok_analyzer.analyze_asset_candidates(scored, asset, self.config, cache_dir, self.console)
                scored = [apply_grok_score(candidate, self.config) for candidate in scored]
            all_candidates.extend(scored)

            cache_payload = {
                "transcript_segments": [
                    {
                        "asset_id": segment.asset_id,
                        "start_sec": segment.start_sec,
                        "end_sec": segment.end_sec,
                        "text": segment.text,
                        "speaker": segment.speaker,
                        "words": [
                            {
                                "start_sec": word.start_sec,
                                "end_sec": word.end_sec,
                                "text": word.text,
                                "speaker": word.speaker,
                            }
                            for word in segment.words
                        ],
                    }
                    for segment in transcript_segments
                ],
                "scenes": [
                    {"start_sec": scene.start_sec, "end_sec": scene.end_sec}
                    for scene in scenes
                ],
                "candidates": [candidate.as_dict() for candidate in scored],
            }
            (cache_dir / f"{asset.id}.json").write_text(
                json.dumps(cache_payload, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

        selected = select_clips(all_candidates, self.config.assembly)
        project = build_timeline_project(
            project_name=self.config.project_name,
            target_duration_sec=self.config.assembly.target_duration_sec,
            selected=selected,
        )
        output_path = output_dir / self.config.output.filename
        extract_and_concat(project, output_path, temp_dir)

        if self.config.output.write_otio:
            write_otio(project, output_dir / f"{output_path.stem}.otio")
        if self.config.output.write_opencut_bundle:
            write_opencut_bundle(
                project,
                self.config,
                output_dir / f"{output_path.stem}.opencut",
            )
        if self.config.output.write_opencut_project:
            write_opencut_project(
                project,
                self.config,
                output_dir / f"{output_path.stem}.opencut-project.json",
            )
        if self.config.output.write_manifest:
            self._write_manifest(project, output_dir / f"{output_path.stem}.manifest.json")
        if self.config.output.write_srt:
            self._write_srt(project, output_dir / f"{output_path.stem}.srt")

        self.console.print(f"[green]Build finished[/green]: {output_path}")
        return output_path

    def _write_manifest(self, project: TimelineProject, path: Path) -> None:
        path.write_text(
            json.dumps(
                project.as_dict(),
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    def _write_srt(self, project: TimelineProject, path: Path) -> None:
        lines: list[str] = []
        index = 1
        clips = [clip for track in project.tracks for clip in track.clips]
        for clip in clips:
            if not clip.text:
                continue
            start = _srt_ts(clip.timeline_start_sec)
            end = _srt_ts(clip.timeline_end_sec)
            lines.extend([str(index), f"{start} --> {end}", clip.text.strip(), ""])
            index += 1
        path.write_text("\n".join(lines), encoding="utf-8")


def _srt_ts(value: float) -> str:
    total_ms = round(value * 1000)
    hours = total_ms // 3_600_000
    total_ms %= 3_600_000
    minutes = total_ms // 60_000
    total_ms %= 60_000
    seconds = total_ms // 1000
    millis = total_ms % 1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"
