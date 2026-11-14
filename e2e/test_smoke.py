"""Smoke test of the owner's Stage A checklist, steps 1-4, in a real browser."""

from __future__ import annotations

import json

from playwright.sync_api import Page, expect


def node(page: Page, element_id: str):
    return page.get_by_test_id(f"node-{element_id}")


def rename_selected(page: Page, name: str):
    field = page.get_by_test_id("field-name")
    expect(field).to_be_focused()
    field.fill(name)
    field.press("Enter")


def test_checklist_steps_1_to_4(page: Page, server):
    # 1. The demo opens on the Engineer lens's first diagram (containers of the banking system).
    expect(page.get_by_test_id("breadcrumb")).to_contain_text("Internet Banking System")
    expect(node(page, "api-application")).to_be_visible()

    # 2. New system with three containers, connected.
    page.get_by_test_id("crumb-landscape").click()
    expect(node(page, "atm")).to_be_visible()
    page.get_by_test_id("add-softwareSystem").click()
    rename_selected(page, "Loans")
    expect(page.get_by_test_id("node-new-system")).to_contain_text("Loans")
    page.get_by_test_id("node-new-system").dblclick()
    expect(page.get_by_test_id("breadcrumb")).to_contain_text("Loans")
    for name in ("Loan UI", "Loan API", "Loan DB"):
        page.get_by_test_id("add-container").click()
        rename_selected(page, name)
        page.get_by_test_id("canvas").click(position={"x": 30, "y": 30})  # deselect
    expect(page.locator(".react-flow__node-c4")).to_have_count(3)
    page.get_by_test_id("auto-layout").click()
    page.wait_for_timeout(500)

    def connect(a: str, b: str):
        src = node(page, a)
        src.hover()
        src.locator(".connect-handle.h-r").drag_to(node(page, b))

    connect("new-container", "new-container-2")
    expect(page.get_by_test_id("edge-panel")).to_be_visible()
    page.get_by_test_id("field-rel-description").fill("Calls")
    page.get_by_test_id("field-rel-description").press("Enter")
    connect("new-container-2", "new-container-3")
    expect(page.locator(".edge-label")).to_have_count(2)
    expect(page.get_by_test_id("edge-new-container--new-container-2")).to_contain_text("Calls")

    # 3. Drill from landscape to containers to components, and back with the breadcrumb.
    page.get_by_test_id("crumb-landscape").click()
    node(page, "internet-banking-system").dblclick()
    expect(node(page, "api-application")).to_be_visible()
    node(page, "api-application").dblclick()
    expect(node(page, "sign-in-controller")).to_be_visible()
    crumb = page.get_by_test_id("breadcrumb")
    expect(crumb).to_contain_text("Landscape")
    expect(crumb).to_contain_text("Internet Banking System")
    expect(crumb).to_contain_text("API Application")
    page.get_by_test_id("crumb-containers-internet-banking-system").click()
    expect(node(page, "web-application")).to_be_visible()
    page.get_by_test_id("crumb-landscape").click()
    expect(node(page, "atm")).to_be_visible()

    # 4. Rename an object; the new name shows in every diagram that contains it.
    node(page, "e-mail-system").click()
    field = page.get_by_test_id("field-name")
    field.fill("Mail Gateway")
    field.press("Enter")
    expect(node(page, "e-mail-system")).to_contain_text("Mail Gateway")
    for key in ("containers-internet-banking-system", "components-api-application", "context-internet-banking-system"):
        page.goto(f"{server['url']}#/d/{key}")
        expect(node(page, "e-mail-system")).to_contain_text("Mail Gateway")

    # The edits are in the file.
    data = json.loads((server["root"] / "architecture" / "workspace.json").read_text())
    names = [s["name"] for s in data["model"]["softwareSystems"]]
    assert "Mail Gateway" in names and "Loans" in names
