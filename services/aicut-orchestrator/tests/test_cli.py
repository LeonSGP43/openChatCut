from typer.testing import CliRunner

from aicut.cli import app


def test_opencut_import_script_prints_helper() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["opencut-import-script"])

    assert result.exit_code == 0
    assert "installAICutOpenCutOverlay" in result.stdout
    assert "importAICutOpenCutBundle" in result.stdout
