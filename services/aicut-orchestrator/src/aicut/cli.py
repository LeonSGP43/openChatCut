from __future__ import annotations

import subprocess
from pathlib import Path

import typer
from rich.console import Console

from aicut.config import BuildConfig
from aicut.pipeline import BuildPipeline

app = typer.Typer(no_args_is_help=True)


def _repo_script_path() -> Path:
    return Path(__file__).resolve().parents[2] / "scripts" / "opencut_import_spike.js"


@app.command()
def build(config: Path = typer.Option(..., exists=True, dir_okay=False, readable=True)) -> None:
    """Build a strict-duration edit from multiple source assets."""
    console = Console()
    cfg = BuildConfig.load(config)
    pipeline = BuildPipeline(cfg, console=console)
    pipeline.run()


@app.command("opencut-import-script")
def opencut_import_script(copy: bool = typer.Option(False, "--copy", help="Copy the helper script to the macOS clipboard.")) -> None:
    """Print the OpenCut import helper script for quick prototype use."""
    console = Console()
    script_path = _repo_script_path()
    if not script_path.exists():
        raise typer.BadParameter(f"Import helper script not found: {script_path}")

    script = script_path.read_text(encoding="utf-8")
    if copy:
        try:
            subprocess.run(["pbcopy"], input=script, text=True, check=True)
        except FileNotFoundError as exc:
            raise typer.BadParameter("pbcopy is not available on this system.") from exc
        console.print(f"[green]Copied[/green] OpenCut import helper to clipboard from {script_path}")
        return

    console.print(script, soft_wrap=True)


if __name__ == "__main__":
    app()
