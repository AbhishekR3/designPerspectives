# W0-SPIKE-OTEL — OTLP/JSON trace shape and current semantic-convention attribute names

Date: 2026-11-12 · Environment: Linux, 2 cores, Node v22.23.4, git shallow clones

## Question
What is the OTLP/JSON trace file shape, the default OTLP/HTTP port and path, and the current attribute names we must read to derive runtime relationships? Informs the trace-import wave.

## Method
Shallow clones into `spikes/misc/repos/`:
- `open-telemetry/opentelemetry-proto` at commit e04129d57b92d14073ab2a4d565c014b205170a6 (2026-11-10; latest tag v1.11.1). Files: `opentelemetry/proto/trace/v1/trace.proto`, `opentelemetry/proto/common/v1/common.proto`, `docs/specification.md`, `examples/trace.json`.
- `open-telemetry/semantic-conventions` at commit d0d920083f7c6b35a26488610bd28bdce1714302 (2026-11-10; latest tag v1.45.0). Files under `model/`.
No collector or SDK was run.

## Findings
| # | Claim from the spec ([Training]) | Result | Evidence |
|---|---|---|---|
| 1 | Shape `resourceSpans -> scopeSpans -> spans` | confirmed | `trace.proto` lines 44, 56, 75 (`resource_spans`, `scope_spans`, `spans`); `examples/trace.json`. JSON keys are lowerCamelCase (`docs/specification.md` line 475). |
| 2 | Span field names | confirmed | `traceId`, `spanId`, `parentSpanId`, `name`, `kind`, `startTimeUnixNano`, `endTimeUnixNano`, `attributes`, `status` (`trace.proto` fields 1, 2, 4, 5, 6, 7, 8, 9, 15); `status` has `message` and `code`. |
| 3 | Encoding details | confirmed | IDs are hex strings, not base64 (spec lines 454-457). Enums are integers only (line 462): kind 0 unspecified, 1 internal, 2 server, 3 client, 4 producer, 5 consumer; status code 0 unset, 1 ok, 2 error. 64-bit integers are decimal strings; decoders accept numbers or strings (lines 484-485). Attribute values use `stringValue`, `boolValue`, `intValue`, `doubleValue`, `arrayValue`, `kvlistValue`, `bytesValue`. |
| 4 | OTLP/HTTP default port 4318, path `/v1/traces` | confirmed | `docs/specification.md` line 717 ("default network port for OTLP/HTTP is 4318"), line 500 (`/v1/traces`); gRPC is 4317 (line 425). |
| 5 | `service.name` (resource) | confirmed, stable | `model/service/registry.yaml:8`. |
| 6 | `peer.service` identifies the remote service | contradicted (deprecated) | `model/peer/deprecated.yaml:11-16`; note: "Use `server.service.name` on the client side or `client.service.name` on the server side." `service.peer.name` is also deprecated with the same note (`model/service/deprecated/registry-deprecated.yaml:8`). Replacements `server.service.name` / `client.service.name` are at `model/server/registry.yaml:84`, `model/client/registry.yaml:84`, stability development. |
| 7 | `db.system` | contradicted (renamed) | `model/db/deprecated/registry-deprecated.yaml:370-374`: `renamed_to: db.system.name`. Current `db.system.name` at `model/db/registry.yaml:220`, stable. Also `db.name` -> deprecated, current `db.namespace` (stable); `db.statement` deprecated, current `db.query.text`. |
| 8 | `messaging.system` | contradicted (renamed) | `model/messaging/deprecated/registry-deprecated.yaml:8-26`: `renamed_to: messaging.system.name`, with value changes (e.g. `aws_sqs` to `aws.sqs`). Current at `model/messaging/registry.yaml:159`, development. |
| 9 | `messaging.destination` vs `.name` | confirmed: current is `messaging.destination.name` | `model/messaging/registry.yaml:32`, development. No `messaging.destination` id exists in `model/`. |
| 10 | HTTP `http.method`, `http.status_code` | contradicted (renamed) | Deprecated at `model/http/deprecated/registry-deprecated.yaml:7,15`. Current: `http.request.method` (`model/http/registry.yaml:39`), `http.response.status_code` (:171), `http.route` (:176, unchanged), all stable. |
| 11 | RPC `rpc.system`, `rpc.service`, `rpc.method` | contradicted (two of three) | `rpc.system` `renamed_to: rpc.system.name` (deprecated file :258; current `model/rpc/registry.yaml:122`, stable). `rpc.service` deprecated: "use fully-qualified `rpc.method` instead" (:310-317). `rpc.method` current and stable (:82), example `com.example.ExampleService/exampleMethod`. `rpc.grpc.status_code` and `rpc.response.status_code` are deprecated; current is `rpc.status_code` (:7, stable). |
| 12 | `server.address` | confirmed, stable | `model/server/registry.yaml:4`; `server.port` at :76, stable. `net.peer.name` is deprecated (`model/network/deprecated/registry-deprecated.yaml:32`). |

Synthetic OTLP/JSON example (hand-written from the files above; not produced by an SDK):
```json
{"resourceSpans":[{
  "resource":{"attributes":[{"key":"service.name","value":{"stringValue":"orders-api"}}]},
  "scopeSpans":[{
    "scope":{"name":"synthetic.instrumentation","version":"0.0.1"},
    "spans":[
      {"traceId":"5b8efff798038103d269b633813fc60c","spanId":"eee19b7ec3c1b174","parentSpanId":"",
       "name":"GET /orders/{id}","kind":2,
       "startTimeUnixNano":"1794400000000000000","endTimeUnixNano":"1794400000120000000",
       "attributes":[{"key":"http.request.method","value":{"stringValue":"GET"}},
                     {"key":"http.route","value":{"stringValue":"/orders/{id}"}},
                     {"key":"http.response.status_code","value":{"intValue":"200"}}],
       "status":{"code":0}},
      {"traceId":"5b8efff798038103d269b633813fc60c","spanId":"eee19b7ec3c1b175","parentSpanId":"eee19b7ec3c1b174",
       "name":"SELECT orders","kind":3,
       "startTimeUnixNano":"1794400000010000000","endTimeUnixNano":"1794400000050000000",
       "attributes":[{"key":"db.system.name","value":{"stringValue":"postgresql"}},
                     {"key":"db.namespace","value":{"stringValue":"shop"}},
                     {"key":"server.address","value":{"stringValue":"db.internal"}},
                     {"key":"server.port","value":{"intValue":"5432"}}],
       "status":{"code":1}}
    ]}]}]}
```

## Not verified
- The OTLP file-exporter format (one JSON object per line or a single document); it is defined in the `opentelemetry-specification` repository, which was not read.
- Which attribute names real SDKs and collectors emit today; deployed instrumentation may still send the deprecated names.
- Which semantic-conventions release first contained each rename (CHANGELOG not searched per attribute).
- Parsing of the synthetic example by any OTLP consumer.

## Recommendation
Evidence: the trace shape, field names, port 4318 and path `/v1/traces` match the spec's assumptions. In semantic-conventions at d0d9200, `db.system`, `messaging.system`, `rpc.system`, `http.method`, `http.status_code`, `rpc.service`, `peer.service` and `net.peer.name` are all in deprecated registries; `messaging.*` and `server.service.name` / `client.service.name` are still at development stability.
Interpretation: the importer should read attributes through a small alias table (current name first, deprecated name as fallback) rather than fixed keys, and should store which name matched. Derive the remote service from `server.service.name`, then `peer.service`, then `server.address`. Accept both string and number for 64-bit fields, and both upper- and lower-case hex IDs. Pin the semantic-conventions commit in the alias table's header so later renames can be diffed.
