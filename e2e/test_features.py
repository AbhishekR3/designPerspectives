"""Browser tests of the stage A2 features (items 1-11 of the owner's Nov 14 request)."""

from __future__ import annotations

import json
import urllib.request

from playwright.sync_api import Page, expect


def api(server, path: str):
    with urllib.request.urlopen(server["url"] + "api" + path) as r:
        return json.load(r)


def node(page: Page, element_id: str):
    return page.get_by_test_id(f"node-{element_id}")


def open_diagram(page: Page, key: str):
    page.evaluate(f"window.location.hash = '#/d/{key}'")
    page.wait_for_timeout(1200)


def rects(page: Page):
    return page.evaluate(
        """() => [...document.querySelectorAll('.react-flow__node-c4')].map(n => {
            const r = n.getBoundingClientRect(); return {id: n.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height};})"""
    )


def click_empty_canvas(page: Page):
    """Click the canvas where no box is: the right edge, mid-height (floating bars and the palette cover the rest)."""
    box = page.get_by_test_id("canvas").bounding_box()
    page.get_by_test_id("canvas").click(position={"x": box["width"] - 15, "y": box["height"] / 2})


def test_new_objects_do_not_overlap(page: Page):
    open_diagram(page, "landscape")
    for _ in range(4):
        page.get_by_test_id("add-person").click()
        click_empty_canvas(page)
    page.wait_for_timeout(500)
    rs = rects(page)
    assert len(rs) >= 12
    for i, a in enumerate(rs):
        for b in rs[i + 1 :]:
            apart = a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"] or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"]
            assert apart, (a, b)


def test_connect_any_side_and_line_editing(page: Page, server):
    open_diagram(page, "landscape")
    src, dst = node(page, "atm"), node(page, "e-mail-system")
    src.hover()
    src.locator(".connect-handle.h-b").drag_to(dst.locator(".connect-handle.h-t"), force=True)
    expect(page.get_by_test_id("edge-panel")).to_be_visible()
    rel = [r for r in api(server, "/state")["relationships"] if r["sourceId"] == "atm" and r["destinationId"] == "e-mail-system"]
    assert rel, "relationship not created"
    d = api(server, "/diagrams/landscape")
    edge = next(e for e in d["edges"] if e["id"] == rel[0]["id"])
    assert edge["layout"]["sourceAnchor"] == {"x": 0.5, "y": 1}
    assert edge["layout"]["targetAnchor"] == {"x": 0.5, "y": 0}
    # drag the bend grip: the control point is stored
    grip = page.get_by_test_id("grip-bend")
    box = grip.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 80, cy + 40, steps=6)
    page.mouse.up()
    page.wait_for_timeout(600)
    edge = next(e for e in api(server, "/diagrams/landscape")["edges"] if e["id"] == rel[0]["id"])
    assert "control" in edge["layout"]
    # line shape and reset
    page.get_by_test_id("line-shape").select_option("orthogonal")
    page.wait_for_timeout(500)
    edge = next(e for e in api(server, "/diagrams/landscape")["edges"] if e["id"] == rel[0]["id"])
    assert edge["layout"]["routing"] == "orthogonal"
    page.get_by_test_id("reset-line").click()
    page.wait_for_timeout(500)
    edge = next(e for e in api(server, "/diagrams/landscape")["edges"] if e["id"] == rel[0]["id"])
    assert edge["layout"] == {}


def test_resize_and_style_a_box(page: Page, server):
    open_diagram(page, "landscape")
    node(page, "atm").click()
    handle = page.locator(".react-flow__resize-control.handle.bottom.right")
    box = handle.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 80, cy + 50, steps=6)
    page.mouse.up()
    page.wait_for_timeout(800)
    n = next(n for n in api(server, "/diagrams/landscape")["nodes"] if n["id"] == "atm")
    assert n["size"] and n["size"]["w"] > 225 * 0.9
    # style: open Appearance, pick a swatch
    node(page, "atm").click()
    if not page.get_by_label("Fill #dcfce7").is_visible():
        page.get_by_test_id("sec-style").get_by_role("button", name="Appearance").click()
    page.get_by_label("Fill #dcfce7").click()
    page.wait_for_timeout(600)
    n = next(n for n in api(server, "/diagrams/landscape")["nodes"] if n["id"] == "atm")
    assert n["style"]["fill"] == "#dcfce7"


def test_technology_tags_notes_sensitive_and_symbol(page: Page, server):
    open_diagram(page, "containers-internet-banking-system")
    node(page, "api-application").click()
    tech = page.get_by_test_id("field-technology-input")
    tech.fill("Redis")
    tech.press("Enter")
    page.wait_for_timeout(600)
    el = next(e for e in api(server, "/state")["elements"] if e["id"] == "api-application")
    assert "Redis" in el["technologies"] and el["technology"].endswith("Redis")
    page.get_by_test_id("field-arch").select_option("cache")
    page.wait_for_timeout(500)
    el = next(e for e in api(server, "/state")["elements"] if e["id"] == "api-application")
    assert el["archType"] == "cache"
    expect(page.get_by_test_id("sensitive-api-application")).to_contain_text("confidential")
    notes = page.get_by_test_id("field-notes")
    notes.fill("Extra note")
    notes.blur()
    page.wait_for_timeout(500)
    el = next(e for e in api(server, "/state")["elements"] if e["id"] == "api-application")
    assert el["notes"].endswith("Extra note")


def test_connector_detail_code_and_file_edit(page: Page, server):
    open_diagram(page, "containers-analytics-platform")
    page.get_by_test_id("edge-event-stream--data-warehouse").dblclick()
    expect(page.get_by_test_id("connector-panel")).to_be_visible()
    for name in ("Consume events", "Mask PII", "Load to warehouse"):
        expect(page.locator(".react-flow__node-c4", has_text=name)).to_be_visible()
    # a stage that names a component opens that component's code
    page.locator(".react-flow__node-c4", has_text="Mask PII").dblclick()
    page.wait_for_timeout(1000)
    expect(page.get_by_test_id("code-panel")).to_be_visible()
    page.get_by_test_id("node-file:sample_code/pipeline/mask_pii.py").dblclick()
    editor = page.get_by_test_id("code-editor")
    expect(editor).to_be_visible()
    editor.fill(editor.input_value() + "\n# edited in the browser\n")
    page.get_by_test_id("code-save").click()
    page.wait_for_timeout(500)
    assert "# edited in the browser" in (server["root"] / "sample_code/pipeline/mask_pii.py").read_text()


def test_sidebars_resize_and_levels_indent(page: Page):
    left = page.locator(".sidebar")
    before = left.bounding_box()["width"]
    r = page.get_by_test_id("resize-left").bounding_box()
    page.mouse.move(r["x"] + 2, r["y"] + 100)
    page.mouse.down()
    page.mouse.move(r["x"] + 122, r["y"] + 100, steps=5)
    page.mouse.up()
    assert left.bounding_box()["width"] > before + 80
    right = page.locator(".panel")
    before = right.bounding_box()["width"]
    r = page.get_by_test_id("resize-right").bounding_box()
    page.mouse.move(r["x"] + 2, r["y"] + 100)
    page.mouse.down()
    page.mouse.move(r["x"] - 80, r["y"] + 100, steps=5)
    page.mouse.up()
    assert right.bounding_box()["width"] > before + 50
    # C-levels shown and each level indented further than the one above
    tag = lambda k: page.get_by_test_id(f"level-{k}")  # noqa: E731
    expect(tag("containers-internet-banking-system")).to_have_text("C2")
    expect(tag("components-api-application")).to_have_text("C3")
    expect(tag("code-sign-in-controller")).to_have_text("C4")
    x = lambda k: tag(k).bounding_box()["x"]  # noqa: E731
    assert x("containers-internet-banking-system") < x("components-api-application") < x("code-sign-in-controller")


def test_undo_redo(page: Page, server):
    open_diagram(page, "landscape")
    names = lambda: [e["name"] for e in api(server, "/state")["elements"]]  # noqa: E731
    page.get_by_test_id("add-person").click()
    page.wait_for_timeout(500)
    assert "New person" in names()
    click_empty_canvas(page)
    page.get_by_test_id("undo").click()
    page.wait_for_timeout(500)
    assert "New person" not in names()
    page.get_by_test_id("redo").click()
    page.wait_for_timeout(500)
    assert "New person" in names()


def test_back_forward_between_diagrams(page: Page):
    open_diagram(page, "landscape")
    page.get_by_test_id("breadcrumb").wait_for()
    page.evaluate("window.location.hash = '#/d/containers-internet-banking-system'")
    page.wait_for_timeout(1000)
    assert "containers-internet-banking-system" in page.url
    page.get_by_test_id("nav-back").click()
    page.wait_for_timeout(1000)
    assert page.url.endswith("landscape")
    page.get_by_test_id("nav-forward").click()
    page.wait_for_timeout(1000)
    assert "containers-internet-banking-system" in page.url


def test_shortcuts_copy_paste_and_export_menu(page: Page, server):
    open_diagram(page, "landscape")
    count = lambda: len(api(server, "/state")["elements"])  # noqa: E731
    before = count()
    node(page, "internet-banking-system").click()
    page.keyboard.press("Control+c")
    page.keyboard.press("Control+v")
    page.wait_for_timeout(800)
    assert count() == before + 1
    page.keyboard.press("Control+d")
    page.wait_for_timeout(800)
    assert count() == before + 2
    page.keyboard.press("Control+z")
    page.wait_for_timeout(800)
    assert count() == before + 1
    page.get_by_test_id("export").click()
    with page.expect_download() as d:
        page.get_by_test_id("export-svg").click()
    assert d.value.suggested_filename.endswith(".svg")


def test_flow_side_panel_shows_step_data(page: Page):
    open_diagram(page, "flow-sign-in")
    page.get_by_test_id("step-next").click()
    page.wait_for_timeout(400)
    expect(page.get_by_test_id("step-example")).to_contain_text("alice")
