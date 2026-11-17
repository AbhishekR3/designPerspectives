/** Test fixture: a small HTTP service on a free local port that stands in for a real target and records what it receives. */

import http from "node:http";
import type { AddressInfo } from "node:net";

export interface Received {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface StandIn {
  url: string;
  received: Received[];
  close(): Promise<void>;
}

/**
 * Paths: `/slow` answers after 300 ms, `/large` answers with 1.5 MB, `/events` is an event stream of two events,
 * `/redirect` redirects to `/there` on itself; anything else echoes the method, path (without its query) and body as JSON
 * (with a `Set-Cookie` and an `X-Seen-Host` header).
 */
export function startStandIn(): Promise<StandIn> {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (b: Buffer) => chunks.push(b));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      const path = req.url ?? "/";
      received.push({ method: req.method ?? "", path, headers: req.headers, body });
      const self = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      if (path === "/large") return void res.writeHead(200, { "Content-Type": "application/octet-stream" }).end(Buffer.alloc(1_500_000, 7));
      if (path === "/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write("data: one\n\n");
        return void setTimeout(() => res.end("data: two\n\n"), 30);
      }
      if (path === "/redirect") return void res.writeHead(302, { Location: `${self}/there` }).end();
      const answer = () =>
        res
          .writeHead(path === "/missing" ? 404 : 200, { "Content-Type": "application/json", "Set-Cookie": "sid=s3cret; Path=/", "X-Seen-Host": req.headers.host ?? "" })
          .end(JSON.stringify({ method: req.method, path: path.split("?")[0], body: body ? safeJson(body) : null }));
      if (path === "/slow") setTimeout(answer, 300);
      else answer();
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
        received,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      }),
    ),
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
