"""Browser smoke-test fixtures: a real server on a free port, and a Playwright page.

Run with:  pytest e2e
Browser: Playwright's Chromium (`playwright install chromium`), or set DP_E2E_CHROME to the path
of a Chrome/Chromium binary.
"""

from __future__ import annotations

import os
import socket
import threading
import time
from pathlib import Path

import pytest
import uvicorn
from playwright.sync_api import sync_playwright

from designperspectives.server import create_app
from designperspectives.store import init_project, static_dir


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def server(tmp_path: Path):
    if static_dir() is None:
        pytest.skip("UI not built (run `npm ci && npm run build` in ui/)")
    init_project(tmp_path, demo=True)
    port = _free_port()
    srv = uvicorn.Server(uvicorn.Config(create_app(tmp_path), host="127.0.0.1", port=port, log_level="warning"))
    t = threading.Thread(target=srv.run, daemon=True)
    t.start()
    for _ in range(100):
        if srv.started:
            break
        time.sleep(0.05)
    yield {"url": f"http://127.0.0.1:{port}/", "root": tmp_path}
    srv.should_exit = True
    t.join(timeout=5)


@pytest.fixture
def page(server):
    with sync_playwright() as p:
        exe = os.environ.get("DP_E2E_CHROME")
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1500, "height": 950})
        pg.on("dialog", lambda d: d.accept())
        errors: list[str] = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(server["url"])
        yield pg
        browser.close()
        assert not errors, errors
