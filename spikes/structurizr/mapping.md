# designPerspectives -> Structurizr mapping (W0-SPIKE-STRUCTURIZR)

Sources: JSON = `structurizr-json/structurizr.yaml` (OpenAPI 3.0.0, `info.version: 6.1.0`) at structurizr/structurizr@ad34036;
DSL = `dsl/71-language.md` at structurizr/structurizr.github.io@530a964. "Clean" = a first-class field/keyword exists.
"Convention" = expressible only through tags/properties that designPerspectives defines itself; other tools will not interpret it.

| designPerspectives concept | Structurizr JSON | Structurizr DSL | Equivalence |
|---|---|---|---|
| person | `model.people[]` (`id,name,description,tags,url,location,group,properties,perspectives,relationships`) | `id = person <name> [description] [tags]` | Clean |
| softwareSystem | `model.softwareSystems[]` (+ `containers`, `documentation`) | `softwareSystem <name> [description] [tags]` | Clean |
| container | `softwareSystems[].containers[]` (+ `technology`, `components`) | `container <name> [description] [technology] [tags]` | Clean |
| dataStore | container with an extra tag, e.g. `"tags": "Element,Container,Database"`; shape via `views.configuration.styles.elements[] {tag, shape: Cylinder}` | `container ... "Database"` + `styles { element "Database" { shape Cylinder } }` | Convention (no element kind; tag name is ours) |
| queue | container + tag (e.g. `Queue`); `shape: Pipe` exists in the `ElementStyle.shape` enum | same, `shape Pipe` | Convention |
| topic | container + tag (e.g. `Topic`) | same | Convention; no way to distinguish topic from queue except the tag |
| component | `containers[].components[]` | `component <name> [description] [technology] [tags]` | Clean |
| deploymentNode | `model.deploymentNodes[]`, nested via `children[]`; `environment`, `instances` (string), `technology` | `deploymentEnvironment <name> { deploymentNode <name> [description] [technology] [tags] [instances] { ... } }` | Clean. JSON has no environment object: `environment` is a string repeated on every node/instance |
| infrastructureNode | `deploymentNodes[].infrastructureNodes[]` | `infrastructureNode <name> [description] [technology] [tags]` | Clean |
| containerInstance | `deploymentNodes[].containerInstances[]` (`id, containerId, instanceId, environment, tags, properties, healthChecks`) | `containerInstance <identifier> [deploymentGroups] [tags]` | Clean. Also `softwareSystemInstances[]` (`softwareSystemId`) / `softwareSystemInstance` |
| element kind (generic) | No `type` field on elements; kind is implied by the containing array | keyword | Importer must derive kind from position |
| relationship (source, target) | Stored in the **source element's** `relationships[]`: `id, sourceId, destinationId` (string ids, one id space shared with elements) | `<identifier> -> <identifier> [description] [technology] [tags]` | Clean |
| relationship label | `relationships[].description` | 3rd token | Clean |
| relationship technology | `relationships[].technology` | 4th token | Clean |
| relationship sync/async | `relationships[].interactionStyle`: `Synchronous` \| `Asynchronous` | No keyword found in the language reference or in `ExplicitRelationshipParser.java`; only a tag `"Asynchronous"` can be written | JSON clean; **DSL lossy** (tag only) |
| relationship kind (calls / publishes / reads / depends-on ...) | none; use `tags` or `properties` | tags, or relationship archetypes (`--https->`) | **No equivalent**; convention via tag `dp:kind=<x>` or property |
| owners (team / person owning an element) | none; `properties {"dp.owner": ...}` and/or `perspectives[] {name:"Ownership", description, value}`; `group` is a visual boundary name only | `properties { }`, `perspectives { }`, `group <name> { }` | **No equivalent**; convention |
| tags | `tags`: one comma-separated **string**; exports from the Java library include default tags (`Element,Person,...`). `FilteredView.tags` is an array | `tags "A,B"` / `tag "A"` / inline 3rd-4th token | Clean; a tag containing a comma cannot be represented |
| per-element properties | `properties`: object, declared as name-value map; available on workspace, model, elements, relationships, views | `properties { <name> <value> }` | Clean for string values; nested/typed values need string encoding |
| perspectives | `perspectives[] {name, description, value, url}` on elements and relationships | `perspectives { <name> <description> [value] }` | Clean |
| group | `group`: string on person/softwareSystem/container/component | `group <name> { ... }` (same abstraction level only) | Clean; one group per element |
| stable id / slug | `id` is a string; the Java library writes numeric strings. DSL identifier is kept in `properties["structurizr.dsl.identifier"]` | `!identifiers hierarchical`, chars `a-zA-Z_0-9` | Partial: designPerspectives ids must be carried in a property and sanitised for DSL |
| view: system context | `views.systemContextViews[] {key, order, title, description, softwareSystemId, elements[], relationships[], automaticLayout, paperSize, dimensions, animations}` | `systemContext <system id> [key] [description] { include ...; title <title> }` | Clean |
| view: container | `views.containerViews[]` (`softwareSystemId`, `externalSoftwareSystemBoundariesVisible`) | `container <system id> [key] [description] { ... }` | Clean |
| view: component | `views.componentViews[]` (`containerId`, `externalContainerBoundariesVisible`) | `component <container id> [key] [description] { ... }` | Clean |
| view: landscape / dynamic / deployment / filtered | `systemLandscapeViews`, `dynamicViews` (`elementId`; relationship `order`, `response`), `deploymentViews` (`softwareSystemId`, `environment`), `filteredViews` (`baseViewKey, mode, tags[]`) | `systemLandscape`, `dynamic <*\|id>`, `deployment <*\|id> <environment>`, `filtered` | Clean |
| view title | `title` | `title <title>` | Clean |
| view membership + layout | `elements[] {id, x, y}`, `relationships[] {id, vertices[] {x,y}, routing, position}` | `include` / `exclude` only; **no x/y in DSL** (`autoLayout [tb\|bt\|lr\|rl]`) | JSON clean; **DSL cannot carry manual layout** |
| ADR | `documentation.decisions[] {id, date, status, title, content, format, elementId}`; `documentation` exists on workspace, softwareSystem, container, component | `!adrs <path> [adrtools\|madr\|log4brains]` inside workspace / softwareSystem / container | Clean for one ADR -> one element |
| ADR links (ADR <-> many elements, ADR <-> ADR) | `elementId` is a single id. `Decision.links` (id, description) exists in `structurizr-core` `Decision.java` but is **absent from structurizr.yaml** | derived by the ADR importer from file content | **Partial**: many-to-many ADR-element links have no equivalent |
| YAML sidecar content (anything else) | `properties` | `properties` | Convention |
