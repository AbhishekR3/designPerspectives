// The demo bank web app: plain browser JavaScript calling the demo API (served by `dp serve --demo`).
"use strict";
const out = document.getElementById("out");
const show = (label, res, body) => (out.textContent = `${label}: ${res.status}\n${JSON.stringify(body, null, 2)}`);
async function call(label, method, path, body) {
  const res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  show(label, res, data);
  return data;
}
const form = (f) => Object.fromEntries(new FormData(f).entries());

document.getElementById("signin-form").addEventListener("submit", (e) => {
  e.preventDefault();
  call("Sign in", "POST", "/api/session", form(e.target));
});
document.getElementById("forgot").addEventListener("click", () => call("Password reset", "POST", "/api/password-resets", { username: "alice" }));
document.getElementById("accounts").addEventListener("click", async () => {
  const data = await call("Accounts", "GET", "/api/accounts");
  const list = document.getElementById("account-list");
  list.innerHTML = "";
  for (const a of data.accounts || []) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.textContent = `${a.name} (${a.id})`;
    b.addEventListener("click", () => call("Account", "GET", `/api/accounts/${a.id}`));
    li.append(b);
    list.append(li);
  }
});
document.getElementById("statements").addEventListener("click", async () => {
  const data = await call("Statements", "GET", "/api/accounts/0001029/statements");
  document.getElementById("statement-list").innerHTML = (data.statements || []).map((s) => `<li>${s.period}: closing balance ${s.closingBalance}</li>`).join("");
});
document.getElementById("pay-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = form(e.target);
  call("Payment", "POST", "/api/payments", { fromAccount: "0001029", toIban: f.toIban, amount: f.amount, currency: "EUR", reference: f.reference });
});
document.getElementById("rates").addEventListener("click", () => call("Exchange rates", "GET", "/api/exchange-rates/2026-11-15"));
