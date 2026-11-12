# Demo workspace 1: Internet Banking System

This demo models the fictional **Internet Banking System** used as the running example in
*The C4 Model* by Simon Brown (O'Reilly, 2026). It exercises every view type designPerspectives
supports in Wave 0 and a sample of each sidecar file.

## Contents

| Path | What it is |
|---|---|
| `model.ts` | `internetBankingModel()`: the in-memory `Model` (elements, relationships, deployment, views) |
| `model.test.ts` | Checks the model with `validateModel` (no errors, no warnings) and every sidecar against its schema |
| `architecture/designperspectives.yaml` | Workspace settings |
| `architecture/permissions.yaml` | Profiles: architect, engineer, business |
| `architecture/sidecars/` | Characteristics, element and relationship sidecars, one question note |
| `architecture/decisions/application/internet-banking/` | ADR-0001: cache generated statements in object storage |

The `.c4` model files are not written by hand; they are generated from `model.ts` with the tool's
canonical printer.

## Views and their sources in the book

| View | Id | Book chapter |
|---|---|---|
| System Landscape View | `landscape` | ch. 3 (the same actors and systems as the context view) |
| System Context View: Internet Banking System | `context` | ch. 3 |
| Container View: Internet Banking System | `containers` | ch. 4 |
| Component View: API Application | `apiComponents` | ch. 5 |
| Dynamic View: API Application, customer sign-in | `signIn` | ch. 7 |
| Deployment View: Internet Banking System, Development | `deploymentDevelopment` | ch. 8 |
| Deployment View: Internet Banking System, Live | `deploymentLive` | ch. 8 |

The code level (ch. 6) is not modelled yet; code-element views arrive in a later wave.

## What comes from the book and what is ours

Taken from the book as facts about the example: element names, element kinds, technologies, and
which elements interact with which.

Written for this project: every element description, relationship label, view description, the
sidecar contents and the ADR text. None of it is copied from the book.

Our interpretation (not stated in the book, or simplified):

- **Live deployment services.** The managed container service, managed MySQL service, CDN and the
  placement of Amazon SES inside the AWS node are kept generic and are our reading of the live
  environment.
- **Development deployment.** The local S3-compatible store is shown as "Local object store
  (MinIO)" in a Docker container; the static content is served from the backend container; the
  mock e-mail service is modelled as a node hosting an instance of Amazon Simple Email Service
  (it stands in for SES locally).
- **Static Content** is modelled as a data store (it is a directory of files), and the
  relationship points from the Single-Page Application to it ("Loads its application files from")
  because our relationship kinds have no "delivers" kind.
- **Characteristics** (`sidecars/characteristics.yaml`) are illustrative: the choice, triggers and
  measures are ours.
- **ADR-0001** restates, in our own words, the container-level decision to cache generated PDF
  statements in object storage; its consequences and compliance sections are ours.
- **Element and relationship sidecars and the note** are illustrative sample data (owners,
  status, data classification, protocols, the open question).
- Component-to-component relationships use the technology "Java method call", and the
  sign-in dynamic view stops at the database lookup.

## Running the checks

```sh
pnpm vitest run examples
```
