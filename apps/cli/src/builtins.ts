/** Plug-ins bundled with the CLI. The application wires plug-ins; the core never imports them (ADR-0005). */
import type { PluginModule } from "@designperspectives/contracts";
import likec4 from "@designperspectives/plugin-model-likec4";
import mermaid from "@designperspectives/plugin-export-mermaid";
import svg from "@designperspectives/plugin-export-svg";
import structurizr from "@designperspectives/plugin-export-structurizr";

export const BUILTIN_PLUGINS: PluginModule[] = [likec4, mermaid, svg, structurizr];
