"""0.2: add palette (drag and drop, click), connect to empty space, rename on the canvas, quick bar,
labels that slide only along their line, line shapes and arrowheads, linked work."""

from __future__ import annotations

import json
import urllib.request

from conftest import wait_until
from playwright.sync_api import Page, expect


def open_diagram(page: Page, key: str):
    page.evaluate(f"window.location.hash = '#/d/{key}'")
    page.wait_for_timeout(1200)


def api(server, path: str):
    with urllib.request.urlopen(server["url"] + "api" + path) as r:
        return json.loads(r.read())


def elements(server):
    return api(server, "/state")["elements"]


def drop_item(page: Page, test_id: str, x: float, y: float):
    """HTML5 drag and drop from the palette onto the canvas at (x, y) in page coordinates."""
    page.evaluate(
        """([id, x, y]) => {
            const src = document.querySelector(`[data-testid="${id}"]`);
            const pane = document.querySelector('.react-flow__pane');
            const dt = new DataTransfer();
            src.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: dt}));
            for (const type of ['dragenter', 'dragover', 'drop'])
                pane.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y}));
        }""",
        [test_id, x, y],
    )


def test_drag_database_from_palette(page: Page, server):
    open_diagram(page, "containers-internet-banking-system")
    box = page.get_by_test_id("canvas").bounding_box()
    drop_item(page, "add-container-database", box["x"] + box["width"] - 260, box["y"] + 200)
    field = page.get_by_test_id("inline-name")
    expect(field).to_be_focused()
    field.fill("Ledger DB")
    field.press("Enter")
    el = wait_until(lambda: next(e for e in elements(server) if e["name"] == "Ledger DB"))
    assert el["kind"] == "container" and el["archType"] == "database" and el["parentId"] == "internet-banking-system"
    expect(page.get_by_test_id(f"node-{el['id']}")).to_have_attribute("data-shape", "database")


def test_click_palette_item_and_quick_bar(page: Page, server):
    open_diagram(page, "containers-internet-banking-system")
    page.get_by_test_id("add-container-queue").click()
    page.get_by_test_id("inline-name").press("Escape")
    el = wait_until(lambda: next(e for e in elements(server) if e["name"].startswith("Queue")))
    assert el["archType"] == "queue"
    # Quick bar: change the symbol, then delete.
    page.get_by_test_id("qb-symbol").select_option("pipeline")
    wait_until(lambda: next(e for e in elements(server) if e["id"] == el["id"])["archType"] == "pipeline")
    page.get_by_test_id("qb-delete").click()
    wait_until(lambda: not any(e["id"] == el["id"] for e in elements(server)))


def test_line_to_empty_space_adds_connected_box(page: Page, server):
    open_diagram(page, "containers-internet-banking-system")
    before = {e["id"] for e in elements(server)}
    src = page.get_by_test_id("node-api-application")
    src.hover()
    h = src.locator(".connect-handle.h-r").bounding_box()
    box = page.get_by_test_id("canvas").bounding_box()
    page.mouse.move(h["x"] + h["width"] / 2, h["y"] + h["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] - 120, box["y"] + box["height"] / 2 + 40, steps=12)
    page.mouse.up()
    expect(page.get_by_test_id("inline-name")).to_be_focused()
    page.get_by_test_id("inline-name").press("Escape")
    new = wait_until(lambda: [e for e in elements(server) if e["id"] not in before])
    assert len(new) == 1 and new[0]["kind"] == "container"
    rels = api(server, "/state")["relationships"]
    assert any(r["sourceId"] == "api-application" and r["destinationId"] == new[0]["id"] for r in rels)


def test_label_slides_only_along_line(page: Page):
    open_diagram(page, "containers-internet-banking-system")
    label = page.get_by_test_id("edge-web-application--single-page-application")
    b = label.bounding_box()
    cx, cy = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 200, cy + 200, steps=8)  # pull far off the line
    page.mouse.up()
    page.wait_for_timeout(500)
    # The label's centre must still lie on the line: its distance to the straight line between
    # the two boxes' centres stays small.
    d = page.evaluate(
        """() => {
            const c = (id) => { const r = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };
            const [ax, ay] = c('node-web-application'), [bx, by] = c('node-single-page-application'), [px, py] = c('edge-web-application--single-page-application');
            return Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / Math.hypot(by - ay, bx - ax);
        }"""
    )
    assert d < 25, d


def test_line_shapes_and_arrowheads(page: Page, server):
    open_diagram(page, "containers-internet-banking-system")
    page.get_by_test_id("edge-web-application--single-page-application").click()
    for shape in ("smooth", "rounded", "orthogonal", "curved", "straight"):
        page.get_by_test_id("line-shape").select_option(shape)
        page.wait_for_timeout(250)
    d = api(server, "/diagrams/containers-internet-banking-system")
    e = next(x for x in d["edges"] if x["id"] == "web-application--single-page-application")
    assert e["layout"]["routing"] == "straight"
    page.get_by_role("button", name="Appearance").click()
    page.get_by_test_id("style-arrow-head").select_option("diamond")
    wait_until(lambda: api(server, "/state")["styles"]["web-application--single-page-application"]["arrowHead"] == "diamond")
    path = page.locator('[data-testid="rf__edge-web-application--single-page-application"] path.react-flow__edge-path')
    expect(path).to_have_attribute("marker-end", "url('#dp-head-diamond')")


def test_link_work_and_overlay(page: Page, server):
    open_diagram(page, "containers-internet-banking-system")
    page.get_by_test_id("node-web-application").click()
    sec = page.get_by_test_id("sec-work")
    sec.locator("button.p-section-head").click()
    sec.get_by_test_id("work-add").click()
    row = sec.locator(".work-row").last
    row.get_by_test_id("work-type").select_option("security")
    row.get_by_test_id("work-title").fill("Session cookie lacks SameSite")
    row.get_by_test_id("work-title").blur()
    el = wait_until(lambda: next(e for e in elements(server) if e["id"] == "web-application" and e["work"]))
    assert el["work"][0]["type"] == "security" and el["work"][0]["status"] == "open"
    page.get_by_test_id("dock-work").click()
    page.locator("[data-testid='overlay-@work:security']").click()
    expect(page.get_by_test_id("badge-web-application")).to_contain_text("1 open")
    expect(page.get_by_test_id("badge-api-application")).to_contain_text("high")
