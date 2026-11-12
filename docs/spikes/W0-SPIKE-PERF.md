# W0-SPIKE-PERF — Reference machine and budget feasibility

Date: 2026-11-12 · Environment: Linux x64 sandbox, 2 cores, 7 GB RAM, Node 22.23.4 (shared with parallel spike work)

## Question
Which machine is the reference for the performance budgets in spec file 01 §7, and do the measurements available after Wave 0 suggest the budgets are reachable? Informs FF7 thresholds.

## Method
No dedicated benchmark was written in Wave 0 (FF7 runs from Wave 1, when views are rendered). This report collects the timings measured by the other spikes and records the owner's machine as reported by the Claude desktop app's device information.

## Findings
| # | Claim | Result | Evidence |
|---|---|---|---|
| 1 | Reference machine is "8-core, 16 GB" (spec 01 §7) | replaced | Owner decision Q1 (2026-11-11): the owner's own Mac is the reference. Device info reported `platform: darwin`, `arch: arm64`, device name `abhisheks-mac-mini-local`. Core count and RAM were not reported by the device info and are **not verified**. |
| 2 | Open workspace with 2,000 elements / 5,000 relationships < 3 s | not verified; partial evidence | W0-SPIKE-LIKEC4: a synthetic model of 610 elements / 540 relationships / 72 views parsed in 486 ms, computed in 202 ms, laid out all 72 views in 1,069 ms, peak RSS 232 MB (shared 2-core Linux box). The 2,000/5,000 size was not measured. |
| 3 | Render a 150-element view < 1 s | not verified | No renderer timing in Wave 0. |
| 4 | Tier-1 ingestion of 200k LOC < 5 min | not verified; partial evidence | W0-SPIKE-TREESITTER: ~5,000-line files parsed in 14–62 ms median per language with web-tree-sitter. |
| 5 | Incremental re-ingestion < 5 s | not verified | Wave 3. |

## Not verified
All budgets on the owner's Mac. Core count / RAM of the Mac.

## Recommendation
Evidence: the only end-to-end model timing (610 elements) is about 1.8 s including layout of every view on a 2-core box. Interpretation: the "open workspace" budget looks reachable if views are laid out lazily (only the visible view at open time), which is how the adapter's `layoutView` is called. Keep the spec 01 §7 budgets unchanged; record the Mac's core count and RAM in the Wave 1 view and run FF7 there.
