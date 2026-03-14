from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from aicut.domain import TimelineProject


def ensure_binary(name: str) -> None:
    if shutil.which(name):
        return
    raise RuntimeError(f"Required binary '{name}' was not found in PATH.")


def extract_and_concat(
    project: TimelineProject,
    output_path: Path,
    temp_dir: Path,
) -> None:
    ensure_binary("ffmpeg")
    temp_dir.mkdir(parents=True, exist_ok=True)

    rendered_parts: list[Path] = []
    clips = [clip for track in project.tracks for clip in track.clips]
    for index, clip in enumerate(clips):
        part_path = temp_dir / f"part_{index:03d}.mp4"
        source_path = Path(clip.source_path)
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(source_path),
            "-ss",
            f"{clip.source_start_sec:.3f}",
            "-to",
            f"{clip.source_end_sec:.3f}",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(part_path),
        ]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        rendered_parts.append(part_path)

    concat_list = temp_dir / "concat.txt"
    concat_list.write_text(
        "".join(f"file '{part.resolve()}'\n" for part in rendered_parts),
        encoding="utf-8",
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_list),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
