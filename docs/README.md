# Docs index

| File | What it is |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to set up, check and send a change; the rule for sharing one checkout between sessions; the steps to make a release; the code of conduct; how to report a security problem; the security model. |
| [CHANGELOG.md](CHANGELOG.md) | Changes per version. |
| [decisions.md](decisions.md) | Running list of project decisions with the reasoning and trade-offs. Add new entries at the end of their topic. Ends the index with the open questions (none today) and where each answered question id went. |
| [planned_features.md](planned_features.md) | Work with a clear scope, meant to be built: what exists, what is missing, what is open, in a fixed format. Where a contributor can pick something up. |
| [architecture.md](architecture.md) | A draft overview of dp's own architecture as C4 diagrams. Hand-written from the source map; not a dp model. |
| [manual-test-plan.md](manual-test-plan.md) | A plan to test every feature by hand in the demo project, with a gap register that calls out everything not confirmed. The steps have not been run yet. |
| [product-vision.md](product-vision.md) | What dp is for, the scope of 1.0.0 (software architecture only, twelve features, not an IDE), and where each feature stands. |
| [waves/](waves/README.md) | The owner's list of 2026-11-17 and the vision, planned as waves: one brief per wave for an agent to run, with the questions the owner answered (options, trade-offs, answers) inside each wave file, and no separate question or review file: the scope decisions are DEC-104. The owner deletes these files before 1.0.0. |
| [import-design.md](import-design.md) | Code import: what the import is for (a high-level C4 picture of a codebase, not an IDE), what matters at each level, how an import runs, what the scan cannot see yet, and the shortened design history. |
| [planned-change.md](planned-change.md) | How to plan an architecture change with drafts, agree it, build it and check the code against the plan, and what that workflow cannot do yet. |
| [notes/c4-model-brown.md](notes/c4-model-brown.md) | Chapter notes on *The C4 Model* (Simon Brown), with implications for this tool. |
| [notes/fundamentals-of-software-architecture-richards-ford.md](notes/fundamentals-of-software-architecture-richards-ford.md) | Chapter notes on *Fundamentals of Software Architecture*, 2nd ed. (Richards, Ford), with implications for this tool. |
| [notes/ui-ux-research.md](notes/ui-ux-research.md) | UI and UX research notes and the ideas taken from them. |
| [reviews.md](reviews.md) | The per-stage reviews in one file, newest first: what was built, how it was checked, limits, owner questions and feedback. |
| [images/](images/) | Screenshots used by the README. (The stage-review screenshots were removed on 2026-11-20.) |

Elsewhere:

- [../demo/README.md](../demo/README.md): the guided tour of the demo, what each demo file is, and the demo's credits. Example CI jobs (`dp check`, `dp diff`) are in [../demo/ci-examples/](../demo/ci-examples/).
- [../tests/README.md](../tests/README.md): the two kinds of tests and `TESTS.csv`, the list of every test.
- [../.claude/CLAUDE.md](../.claude/CLAUDE.md): the map of the source code (each folder and file and its job).

The notes are paraphrased and keep the books' page numbers. Lines starting with `→ designPerspectives` are interpretation, not the authors' text.
