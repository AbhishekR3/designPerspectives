# Docs index

| File | What it is |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to set up, check and send a change; the code of conduct; how to report a security problem; the security model. |
| [CHANGELOG.md](CHANGELOG.md) | Changes per version. |
| [decisions.md](decisions.md) | Running list of project decisions with the reasoning and trade-offs. Add new entries at the bottom. |
| [planned_features.md](planned_features.md) | Work with a clear scope, meant to be built: what exists, what is missing, what is open, in a fixed format. Where a contributor can pick something up. |
| [architecture.md](architecture.md) | A draft overview of dp's own architecture as C4 diagrams. Hand-written from the source map; not a dp model. |
| [manual-test-plan.md](manual-test-plan.md) | A draft plan to test every feature by hand in the demo project. The steps have not been run yet. |
| [product-vision.md](product-vision.md) | What dp is for, the scope of 1.0.0 (software architecture only, twelve features, not an IDE), and where each feature stands. |
| [waves/](waves/README.md) | The owner's list of 2026-11-17 and the vision, planned as waves: one brief per wave for an agent to run, the questions for the owner, and [v1-scope-review.md](waves/v1-scope-review.md), the items outside software architecture. The owner deletes these files before 1.0.0. |
| [import-design.md](import-design.md) | The design record of the code import: why a purpose-built import file, the readiness analysis, and what the public brain-dump prompt contributed. |
| [planned-change.md](planned-change.md) | How to plan an architecture change with drafts, agree it, build it and check the code against the plan, and what that workflow cannot do yet. |
| [notes/c4-model-brown.md](notes/c4-model-brown.md) | Chapter notes on *The C4 Model* (Simon Brown), with implications for this tool. |
| [notes/fundamentals-of-software-architecture-richards-ford.md](notes/fundamentals-of-software-architecture-richards-ford.md) | Chapter notes on *Fundamentals of Software Architecture*, 2nd ed. (Richards, Ford), with implications for this tool. |
| [notes/ui-ux-research.md](notes/ui-ux-research.md) | UI and UX research notes and the ideas taken from them. |
| [reviews.md](reviews.md) | The per-stage reviews in one file, newest first: what was built, how it was checked, limits, owner questions and feedback. |
| [images/](images/), [reviews/](reviews/) | Screenshots used by the README and the reviews. |

Elsewhere:

- [../demo/README.md](../demo/README.md): the guided tour of the demo, what each demo file is, and the demo's credits. Example CI jobs (`dp check`, `dp diff`) are in [../demo/ci-examples/](../demo/ci-examples/).
- [../tests/README.md](../tests/README.md): the two kinds of tests and `TESTS.csv`, the list of every test.
- [../.claude/CLAUDE.md](../.claude/CLAUDE.md): the map of the source code (each folder and file and its job).

The notes are paraphrased and keep the books' page numbers. Lines starting with `→ designPerspectives` are interpretation, not the authors' text.
