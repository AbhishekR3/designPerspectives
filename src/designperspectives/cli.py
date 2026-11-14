"""`dp` command line."""

from __future__ import annotations

import threading
import webbrowser
from pathlib import Path

import typer

from .store import ARCH_DIR, WORKSPACE_FILE, Project, init_project

app = typer.Typer(help="designPerspectives: C4 architecture models with lenses.", no_args_is_help=True, add_completion=False)


@app.command()
def init(
    path: Path = typer.Argument(Path("."), help="Project folder; the model goes in <path>/architecture/."),
    empty: bool = typer.Option(False, "--empty", help="Start with an empty model instead of the demo."),
    name: str = typer.Option(None, help="Workspace name (empty model only)."),
):
    """Create architecture/workspace.json (demo model by default)."""
    try:
        arch = init_project(path, demo=not empty, name=name)
    except FileExistsError as e:
        typer.echo(f"Not overwriting: {e}", err=True)
        raise typer.Exit(1)
    typer.echo(f"Created {arch}")


@app.command()
def serve(
    path: Path = typer.Argument(Path("."), help="Project folder containing architecture/."),
    port: int = typer.Option(8765, help="Port to listen on."),
    host: str = typer.Option("127.0.0.1", help="Interface to bind. Keep the default unless you know you need another."),
    open_browser: bool = typer.Option(True, "--open/--no-open", help="Open the browser."),
    read_only: bool = typer.Option(False, "--read-only", help="Viewer role: browse only; every change is refused."),
    code_root: Path = typer.Option(None, "--code-root", help="Folder holding the source code that components point to (default: the project folder)."),
):
    """Serve the model in the browser. Creates the demo model first if the folder has none."""
    import uvicorn

    from .server import create_app

    ws_path = path / ARCH_DIR / WORKSPACE_FILE
    if not ws_path.exists():
        arch = init_project(path, demo=True)
        typer.echo(f"No model found; created the demo model in {arch}")
    application = create_app(path, code_root, read_only)
    url = f"http://{host}:{port}/"
    typer.echo(f"designPerspectives: {url}  (Ctrl+C to stop)")
    if open_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    uvicorn.run(application, host=host, port=port, log_level="warning")


@app.command()
def validate(path: Path = typer.Argument(Path("."), help="Project folder containing architecture/.")):
    """Check the model files; exit code 1 if there are problems."""
    try:
        project = Project(path)
    except FileNotFoundError as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(2)
    except ValueError as e:
        typer.echo(f"Could not read the model: {e}", err=True)
        raise typer.Exit(1)
    if project.load_errors:
        for e in project.load_errors:
            typer.echo(f"- {e}")
        raise typer.Exit(1)
    typer.echo("OK")


if __name__ == "__main__":
    app()
