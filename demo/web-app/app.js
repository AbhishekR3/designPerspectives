// The demo banking page: plain browser JavaScript. Before every call it asks /config.json where to send it,
// so an intercept point opened a second ago is used at once.
"use strict";
const out = document.getElementById("out");
const note = document.getElementById("note");

async function call(service, method, path, body) {
  let base;
  try {
    const config = await (await fetch("/config.json", { cache: "no-store" })).json();
    base = config[service];
  } catch (e) {
    note.textContent = "The page could not read /config.json.";
    return;
  }
  const url = base + path;
  note.textContent = `Called ${base} (${service}).`;
  out.textContent = `${method} ${url}\n...`;
  try {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    out.textContent = `${method} ${url}\nStatus ${res.status}\n${JSON.stringify(data, null, 2)}`;
  } catch (e) {
    out.textContent = `${method} ${url}\nThe call failed: ${e.message}`;
  }
}

const payment = (amount) => ({ fromAccount: "0001029", toIban: "DE89370400440532013000", amount, currency: "EUR", reference: "Invoice 2026-118" });

document.getElementById("signin").addEventListener("click", () => call("api", "POST", "/api/session", { user: "alice", password: "correct horse" }));
document.getElementById("accounts").addEventListener("click", () => call("api", "GET", "/api/accounts"));
document.getElementById("pay").addEventListener("click", () => call("payments", "POST", "/api/payments", payment(document.getElementById("amount").value)));
document.getElementById("pay-large").addEventListener("click", () => call("payments", "POST", "/api/payments", payment("9000")));
