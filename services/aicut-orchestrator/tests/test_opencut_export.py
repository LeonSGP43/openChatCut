import json
from pathlib import Path
import zipfile

from aicut.adapters import opencut as opencut_adapter
from aicut.config import AssemblyConfig, BuildConfig
from aicut.domain import CandidateClip, SelectedClip
from aicut.adapters.opencut import write_opencut_bundle, write_opencut_project
from aicut.services.timeline import build_timeline_project


def _candidate(name: str, asset_id: str, source_path: str, start: float, end: float, score: float) -> CandidateClip:
    candidate = CandidateClip(
        candidate_id=name,
        asset_id=asset_id,
        source_path=source_path,
        order=1,
        soft_start_sec=start,
        soft_end_sec=end,
        hard_start_sec=start,
        hard_end_sec=end,
        text=name,
        words=[],
        speaker=None,
    )
    candidate.score = score
    return candidate


def test_write_opencut_project_emits_expected_shape(tmp_path) -> None:
    source = tmp_path / "video-a.mp4"
    source.write_bytes(b"fake-video")
    selected = [
        SelectedClip(
            candidate=_candidate("clip-1", "asset-1", str(source), 2.0, 5.0, 2.5),
            final_start_sec=2.0,
            final_end_sec=5.0,
        )
    ]
    project = build_timeline_project("demo", 3.0, selected)
    config = BuildConfig(
        project_name="demo",
        assets=[],
        assembly=AssemblyConfig(target_duration_sec=3.0),
    )
    out = tmp_path / "demo.opencut-project.json"
    write_opencut_project(project, config, out)

    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["version"] == 9
    assert payload["metadata"]["name"] == "demo"
    assert payload["scenes"][0]["tracks"][0]["type"] == "video"
    assert payload["scenes"][0]["tracks"][0]["elements"][0]["mediaId"] == "asset-1"

    media_payload = json.loads(out.with_suffix(".media.json").read_text(encoding="utf-8"))
    assert media_payload["assets"][0]["mediaId"] == "asset-1"
    assert media_payload["assets"][0]["sourcePath"] == str(source.resolve())


def test_write_opencut_bundle_emits_archive_layout(tmp_path) -> None:
    source = tmp_path / "video-a.mp4"
    source.write_bytes(b"fake-video")
    selected = [
        SelectedClip(
            candidate=_candidate("clip-1", "asset-1", str(source), 2.0, 5.0, 2.5),
            final_start_sec=2.0,
            final_end_sec=5.0,
        )
    ]
    project = build_timeline_project("demo", 3.0, selected)
    config = BuildConfig(
        project_name="demo",
        assets=[],
        assembly=AssemblyConfig(target_duration_sec=3.0),
    )
    out = tmp_path / "demo.opencut"
    write_opencut_bundle(project, config, out)

    with zipfile.ZipFile(out, "r") as archive:
        names = sorted(archive.namelist())
        assert names == ["manifest.json", "media/asset-1-video-a.mp4", "project.json"]
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        payload = json.loads(archive.read("project.json").decode("utf-8"))
        assert manifest["projectFile"] == "project.json"
        assert manifest["assets"][0]["bundledFile"] == "media/asset-1-video-a.mp4"
        assert "sourcePath" not in manifest["assets"][0]
        assert payload["metadata"]["name"] == "demo"


def test_write_opencut_bundle_manifest_matches_portable_contract(tmp_path) -> None:
    source = tmp_path / "video-a.mp4"
    source.write_bytes(b"fake-video")
    selected = [
        SelectedClip(
            candidate=_candidate("clip-1", "asset-1", str(source), 2.0, 5.0, 2.5),
            final_start_sec=2.0,
            final_end_sec=5.0,
        )
    ]
    project = build_timeline_project("demo", 3.0, selected)
    config = BuildConfig(
        project_name="demo",
        assets=[],
        assembly=AssemblyConfig(target_duration_sec=3.0),
    )
    project_out = tmp_path / "demo.opencut-project.json"
    bundle_out = tmp_path / "demo.opencut"

    write_opencut_project(project, config, project_out)
    write_opencut_bundle(project, config, bundle_out)

    debug_manifest = json.loads(project_out.with_suffix(".media.json").read_text(encoding="utf-8"))
    with zipfile.ZipFile(bundle_out, "r") as archive:
        bundle_manifest = json.loads(archive.read("manifest.json").decode("utf-8"))

    assert debug_manifest["assets"][0]["sourcePath"] == str(source.resolve())
    assert "sourcePath" not in bundle_manifest["assets"][0]
    assert bundle_manifest["assets"][0]["bundledFile"] == debug_manifest["assets"][0]["bundledFile"]
    assert bundle_manifest["assets"][0]["originalName"] == debug_manifest["assets"][0]["originalName"]


def test_write_opencut_project_uses_probed_canvas_size(tmp_path, monkeypatch) -> None:
    source = tmp_path / "video-a.mp4"
    source.write_bytes(b"fake-video")
    selected = [
        SelectedClip(
            candidate=_candidate("clip-1", "asset-1", str(source), 2.0, 5.0, 2.5),
            final_start_sec=2.0,
            final_end_sec=5.0,
        )
    ]
    project = build_timeline_project("demo", 3.0, selected)
    config = BuildConfig(
        project_name="demo",
        assets=[],
        assembly=AssemblyConfig(target_duration_sec=3.0),
    )
    monkeypatch.setattr(
        opencut_adapter,
        "_probe_canvas_size",
        lambda _path: {"width": 720, "height": 960},
    )
    out = tmp_path / "demo.opencut-project.json"
    write_opencut_project(project, config, out)

    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["settings"]["canvasSize"] == {"width": 720, "height": 960}
    assert payload["settings"]["originalCanvasSize"] == {"width": 720, "height": 960}
