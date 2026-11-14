"""Stage A3: overlay dock (tags, characteristics, cost), Focus/Hide filters, ratings and cost in the
object panel, the flow step card, and search."""

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


def test_tag_overlay_focus_and_hide(page: Page):
    open_diagram(page, "components-api-application")
    page.get_by_test_id("dock-tags").click()
    page.get_by_test_id("overlay-Risk").click()
    expect(page.get_by_test_id("badge-security-component")).to_contain_text("High")
    # Focus on High: other boxes are dimmed.
    page.get_by_test_id("chip-High").click()
    page.get_by_test_id("filter-focus").click()
    expect(page.get_by_test_id("node-security-component")).not_to_have_class("dimmed")
    assert "dimmed" in page.get_by_test_id("node-sign-in-controller").get_attribute("class")
    # Hide High: those boxes leave the canvas.
    page.get_by_test_id("chip-High").click()
    page.get_by_test_id("filter-hide").click()
    expect(page.get_by_test_id("node-security-component")).to_have_count(0)
    page.get_by_test_id("clear-filters").click()
    expect(page.get_by_test_id("node-security-component")).to_have_count(1)


def test_characteristic_overlay_and_rating(page: Page, server):
    open_diagram(page, "containers-internet-banking-system")
    page.get_by_test_id("node-web-application").click()
    page.get_by_test_id("char-add-rating").select_option("Testability")
    page.get_by_test_id("rate-Testability-5").click()
    wait_until(lambda: {"name": "Testability", "rating": 5} in next(e for e in api(server, "/state")["elements"] if e["id"] == "web-application")["characteristics"])
    page.get_by_test_id("dock-char").click()
    page.locator("[data-testid='overlay-@char:Testability']").click()
    expect(page.get_by_test_id("badge-web-application")).to_contain_text("★★★★★")
    expect(page.get_by_test_id("badge-mobile-app")).to_contain_text("★★☆☆☆")


def test_cost_lines_and_overlay(page: Page, server):
    open_diagram(page, "containers-internet-banking-system")
    page.get_by_test_id("node-web-application").click()
    sec = page.get_by_test_id("sec-cost")
    sec.get_by_test_id("cost-rows-add").click()
    rows = sec.locator(".rowed")
    last = rows.nth(rows.count() - 1)
    last.locator("input").nth(0).fill("CDN")
    last.locator("input").nth(1).fill("20")
    last.locator("input").nth(1).blur()
    wait_until(lambda: next(e for e in api(server, "/state")["elements"] if e["id"] == "web-application")["costTotal"] == 200)
    page.get_by_test_id("dock-cost").click()
    page.locator("[data-testid='overlay-@cost']").click()
    expect(page.get_by_test_id("badge-web-application")).to_contain_text("200")
    expect(page.get_by_test_id("cost-total")).to_contain_text("/mo")


def test_flow_card_intro_steps_conclusion(page: Page):
    open_diagram(page, "flow-sign-in")
    card = page.get_by_test_id("player")
    expect(card).to_contain_text("Introduction")
    page.get_by_test_id("step-next").click()
    expect(card).to_contain_text("1.")
    expect(card).to_contain_text("To")
    for _ in range(30):  # walk to the end; the flow has fewer steps than this
        if page.get_by_test_id("step-next").is_disabled():
            break
        page.get_by_test_id("step-next").click()
    expect(card).to_contain_text("Conclusion")
    expect(page.get_by_test_id("step-next")).to_be_disabled()


def test_search_reveals_object(page: Page):
    open_diagram(page, "landscape")
    page.keyboard.press("Control+k")
    page.get_by_test_id("search-input").fill("pii")
    page.get_by_test_id("search-input").press("Enter")
    page.wait_for_timeout(1200)
    expect(page.get_by_test_id("node-pii-masker")).to_be_visible()
    expect(page.get_by_test_id("object-panel")).to_be_visible()
