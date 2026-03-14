from __future__ import annotations

import json
import subprocess
import zipfile
from pathlib import Path
from uuid import uuid4

from aicut.config import BuildConfig
from aicut.domain import TimelineProject

DEFAULT_OPENCUT_CANVAS = {"width": 1920, "height": 1080}
DEFAULT_OPENCUT_TIMELINE_VIEW = {
    "zoomLevel": 1,
    "scrollLeft": 0,
    "playheadTime": 0,
}
CURRENT_OPENCUT_PROJECT_VERSION = 9


def _probe_duration(path: str) -> float | None:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    except Exception:
        return None
    value = result.stdout.strip()
    try:
        return float(value)
    except ValueError:
        return None


def _probe_canvas_size(path: str) -> dict[str, int] | None:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
    ]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    except Exception:
        return None

    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if len(lines) < 2:
        return None

    try:
        width = int(lines[0])
        height = int(lines[1])
    except ValueError:
        return None

    if width <= 0 or height <= 0:
        return None

    return {"width": width, "height": height}


def _resolve_canvas_size(project: TimelineProject) -> dict[str, int]:
    for track in project.tracks:
        for clip in track.clips:
            canvas_size = _probe_canvas_size(clip.source_path)
            if canvas_size is not None:
                return canvas_size
    return dict(DEFAULT_OPENCUT_CANVAS)


def _asset_duration_lookup(project: TimelineProject) -> dict[str, float]:
    lookup: dict[str, float] = {}
    for track in project.tracks:
        for clip in track.clips:
            if clip.asset_id in lookup:
                continue
            lookup[clip.asset_id] = _probe_duration(clip.source_path) or clip.source_end_sec
    return lookup


def _build_asset_manifest(project: TimelineProject) -> list[dict]:
    duration_lookup = _asset_duration_lookup(project)
    seen: set[str] = set()
    assets: list[dict] = []
    for track in project.tracks:
        for clip in track.clips:
            if clip.asset_id in seen:
                continue
            seen.add(clip.asset_id)
            assets.append(
                {
                    "mediaId": clip.asset_id,
                    "name": Path(clip.source_path).name,
                    "type": "video",
                    "sourcePath": str(Path(clip.source_path).resolve()),
                    "duration": duration_lookup.get(clip.asset_id),
                }
            )
    return assets


def _bundle_filename(asset: dict) -> str:
    safe_name = Path(asset["name"]).name
    return f'{asset["mediaId"]}-{safe_name}'


def _bundle_manifest(manifest: dict) -> dict:
    bundle_assets = []
    for asset in manifest["assets"]:
        bundle_assets.append(
            {
                "mediaId": asset["mediaId"],
                "bundledFile": asset["bundledFile"],
                "originalName": asset["originalName"],
                "type": asset["type"],
                "duration": asset["duration"],
            }
        )

    return {
        "schemaVersion": manifest["schemaVersion"],
        "projectName": manifest["projectName"],
        "targetDurationSec": manifest["targetDurationSec"],
        "exportedAt": manifest["exportedAt"],
        "projectFile": manifest["projectFile"],
        "assets": bundle_assets,
    }


def build_opencut_payloads(
    project: TimelineProject,
    config: BuildConfig,
) -> tuple[dict, dict]:
    del config
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
    scene_id = str(uuid4())
    track_id = str(uuid4())
    canvas_size = _resolve_canvas_size(project)
    asset_manifest = _build_asset_manifest(project)
    assets_by_id = {asset["mediaId"]: asset for asset in asset_manifest}

    video_elements = []
    for clip in project.tracks[0].clips:
        source_duration = assets_by_id.get(clip.asset_id, {}).get("duration") or clip.source_end_sec
        trim_start = clip.source_start_sec
        trim_end = max(0.0, source_duration - clip.source_end_sec)
        video_elements.append(
            {
                "id": str(uuid4()),
                "type": "video",
                "mediaId": clip.asset_id,
                "name": clip.clip_id,
                "duration": clip.duration_sec,
                "startTime": clip.timeline_start_sec,
                "trimStart": trim_start,
                "trimEnd": trim_end,
                "sourceDuration": source_duration,
                "muted": False,
                "hidden": False,
                "transform": {
                    "scale": 1,
                    "position": {"x": 0, "y": 0},
                    "rotate": 0,
                },
                "opacity": 1,
                "blendMode": "normal",
            }
        )

    payload = {
        "metadata": {
            "id": str(uuid4()),
            "name": project.project_name,
            "duration": project.duration_sec,
            "createdAt": now,
            "updatedAt": now,
        },
        "scenes": [
            {
                "id": scene_id,
                "name": "Main scene",
                "isMain": True,
                "tracks": [
                    {
                        "id": track_id,
                        "name": "Main Track",
                        "type": "video",
                        "elements": video_elements,
                        "isMain": True,
                        "muted": False,
                        "hidden": False,
                    }
                ],
                "bookmarks": [],
                "createdAt": now,
                "updatedAt": now,
            }
        ],
        "currentSceneId": scene_id,
        "settings": {
            "fps": 30,
            "canvasSize": canvas_size,
            "originalCanvasSize": canvas_size,
            "background": {"type": "color", "color": "#000000"},
        },
        "version": CURRENT_OPENCUT_PROJECT_VERSION,
        "timelineViewState": DEFAULT_OPENCUT_TIMELINE_VIEW,
    }

    manifest = {
        "schemaVersion": 1,
        "projectName": project.project_name,
        "targetDurationSec": project.target_duration_sec,
        "exportedAt": now,
        "projectFile": "project.json",
        "assets": [
            {
                "mediaId": asset["mediaId"],
                "bundledFile": f'media/{_bundle_filename(asset)}',
                "originalName": asset["name"],
                "type": asset["type"],
                "duration": asset["duration"],
                "sourcePath": asset["sourcePath"],
            }
            for asset in asset_manifest
        ],
    }
    return payload, manifest


def write_opencut_project(
    project: TimelineProject,
    config: BuildConfig,
    path: Path,
) -> None:
    payload, manifest = build_opencut_payloads(project, config)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    media_manifest_path = path.with_suffix(".media.json")
    media_manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def write_opencut_bundle(
    project: TimelineProject,
    config: BuildConfig,
    path: Path,
) -> None:
    payload, manifest = build_opencut_payloads(project, config)
    bundle_manifest = _bundle_manifest(manifest)
    path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(path, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("project.json", json.dumps(payload, indent=2, ensure_ascii=False))
        archive.writestr("manifest.json", json.dumps(bundle_manifest, indent=2, ensure_ascii=False))
        for asset in manifest["assets"]:
            source_path = Path(asset["sourcePath"])
            if not source_path.exists():
                raise FileNotFoundError(
                    f"Cannot add media to OpenCut bundle because source file does not exist: {source_path}"
                )
            archive.write(source_path, arcname=asset["bundledFile"])
