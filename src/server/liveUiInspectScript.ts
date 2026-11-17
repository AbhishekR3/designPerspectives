/**
 * The script the live UI proxy adds to every HTML page of the inspected app (served as
 * `/__dp_inspect.js` from the proxy, so it is same-origin with the app).
 *
 * It records clicks and the fetch / XMLHttpRequest calls made in the INSPECT_WINDOW_MS after each
 * click, and posts them to the dp page that frames the app. It talks only to the origin that sent
 * it a "dp-hello" message from the parent window, and does nothing when the page is not framed.
 * Request and response bodies are cut to SAMPLE_MAX characters; JSON fields whose names look like
 * secrets (password, token, authorization, cookie, card number, ...) are replaced with "•••" before
 * anything leaves the page.
 *
 * Calls to the app's own origin get a W3C `traceparent` header (unless they have one), so a backend
 * that records OpenTelemetry traces puts the call's spans under a trace ID dp knows. Calls to other
 * origins are left alone: a new header would make the browser ask the other server first (CORS).
 */

export const INSPECT_SCRIPT_PATH = "/__dp_inspect.js";
export const INSPECT_WINDOW_MS = 2000;
export const SAMPLE_MAX = 2000;

export const INSPECT_SCRIPT = `(function () {
  "use strict";
  if (window.__dpInspect || window.parent === window) return;
  window.__dpInspect = true;
  var WINDOW = ${INSPECT_WINDOW_MS}, CAP = ${SAMPLE_MAX};
  var SECRET = /pass(word|wd)?$|secret|token|authori[sz]ation|cookie|session|api[-_.]?key|ssn|cvv|cvc|card[-_.]?(number|no)|pan$|iban|pin$/i; // = SECRET_FIELD in src/shared/secretFields.ts
  var IGNORE = /\\/__dp_|\\/@vite\\/|\\/@react-refresh|\\/@fs\\/|hot-update|__webpack_hmr|sockjs-node|webpack-hmr|\\/node_modules\\//;
  var parentOrigin = null, queue = [], seq = 0, current = null;

  function send(m) {
    if (parentOrigin) window.parent.postMessage(m, parentOrigin);
    else if (queue.length < 500) queue.push(m);
  }
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent || !e.data || e.data.type !== "dp-hello") return;
    parentOrigin = e.origin;
    var q = queue; queue = [];
    send({ type: "dp-ready", href: location.href, title: document.title });
    q.forEach(send);
  });

  function walk(v, d) {
    if (d > 6) return "…";
    if (Array.isArray(v)) return v.slice(0, 3).map(function (x) { return walk(x, d + 1); });
    if (v && typeof v === "object") {
      var o = {};
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = SECRET.test(k) ? "•••" : walk(v[k], d + 1);
      return o;
    }
    return v;
  }
  function sample(t) {
    if (typeof t !== "string" || !t) return "";
    try { t = JSON.stringify(walk(JSON.parse(t), 0)); } catch (e) {
      if (/[=&]/.test(t) && !/\\s/.test(t)) t = t.replace(/([^&=]+)=([^&]*)/g, function (m, k, v) { return SECRET.test(decodeURIComponent(k)) ? k + "=•••" : m; });
    }
    return t.length > CAP ? t.slice(0, CAP) + "…" : t;
  }
  function id() { return Date.now().toString(36) + "-" + (++seq); }
  function owner() { return current && Date.now() - current.at <= WINDOW ? current.id : null; }
  function abs(u) { try { return new URL(u, location.href).href; } catch (e) { return String(u); } }
  function sameOrigin(u) { try { return new URL(u, location.href).origin === location.origin; } catch (e) { return false; } }
  function hex(n) { var b = new Uint8Array(n), s = ""; crypto.getRandomValues(b); for (var i = 0; i < n; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16); return s; }
  function traceparent() { var t = hex(16); return { traceId: t, header: "00-" + t + "-" + hex(8) + "-01" }; }

  function describe(el) {
    var path = [], n = el;
    for (var i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) {
      var s = n.tagName.toLowerCase();
      if (n.id) { path.unshift(s + "#" + n.id); break; }
      var t = n.getAttribute("data-testid");
      if (t) s += '[data-testid="' + t + '"]';
      else if (typeof n.className === "string" && n.className.trim()) s += "." + n.className.trim().split(/\\s+/).slice(0, 2).join(".");
      path.unshift(s);
    }
    var label = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("name") || el.getAttribute("alt") || "";
    var text = (el.innerText || el.value || "").replace(/\\s+/g, " ").trim().slice(0, 80);
    if (el.type === "password") text = "";
    return { selector: path.join(" > "), tag: el.tagName.toLowerCase(), text: text, label: label };
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    var el = (t.closest && t.closest("a,button,input,select,textarea,summary,label,[role=button],[role=link],[role=tab],[role=menuitem],[data-testid]")) || t;
    current = { id: id(), at: Date.now() };
    var c = describe(el);
    c.id = current.id;
    send({ type: "dp-click", click: c });
  }, true);

  function started(method, url, body, traceId) {
    var call = { id: id(), clickId: owner(), method: String(method || "GET").toUpperCase(), url: abs(url), at: Date.now(), request: sample(typeof body === "string" ? body : ""), traceId: traceId || "" };
    send({ type: "dp-call", call: call });
    return call;
  }
  function done(call, status, text, err) {
    send({ type: "dp-done", call: { id: call.id, status: status, ms: Date.now() - call.at, response: sample(text || ""), error: err || "" } });
  }

  var realFetch = window.fetch;
  if (realFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
      if (IGNORE.test(abs(url))) return realFetch.apply(this, arguments);
      var method = (init && init.method) || (input && input.method) || "GET";
      var traceId = "";
      if (sameOrigin(url)) {
        var h = new Headers((init && init.headers) || (input && typeof input === "object" && input.headers) || undefined);
        var tp = h.get("traceparent");
        if (tp) traceId = tp.split("-")[1] || "";
        else { var made = traceparent(); h.set("traceparent", made.header); traceId = made.traceId; init = Object.assign({}, init, { headers: h }); }
      }
      var call = started(method, url, init && init.body, traceId);
      return realFetch.call(this, input, init).then(function (res) {
        var ct = (res.headers && res.headers.get("content-type")) || "";
        if (/json|text|xml|x-www-form/.test(ct)) res.clone().text().then(function (t) { done(call, res.status, t); }, function () { done(call, res.status, ""); });
        else done(call, res.status, "");
        return res;
      }, function (err) { done(call, 0, "", String(err)); throw err; });
    };
  }

  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  var XH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__dp = { method: m, url: u, tp: "" }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__dp && String(k).toLowerCase() === "traceparent") this.__dp.tp = String(v); return XH.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    var x = this, d = x.__dp;
    if (d && !IGNORE.test(abs(d.url))) {
      var traceId = "";
      if (d.tp) traceId = d.tp.split("-")[1] || "";
      else if (sameOrigin(d.url)) { var made = traceparent(); XH.call(x, "traceparent", made.header); traceId = made.traceId; }
      var call = started(d.method, d.url, body, traceId);
      x.addEventListener("loadend", function () {
        var t = "";
        try { t = x.responseType === "" || x.responseType === "text" ? x.responseText : x.responseType === "json" ? JSON.stringify(x.response) : ""; } catch (e) {}
        done(call, x.status, t);
      });
    }
    return XS.apply(this, arguments);
  };

  // A form the app does not handle itself navigates the page: record it (bubble phase, after the
  // app's own handlers, so a form handled with fetch is not counted twice).
  window.addEventListener("submit", function (e) {
    var f = e.target;
    if (e.defaultPrevented || !f || f.tagName !== "FORM") return;
    var call = started(f.getAttribute("method") || "GET", f.getAttribute("action") || location.href, "");
    done(call, 0, "", "form submitted; the page navigates");
  });
})();
`;
