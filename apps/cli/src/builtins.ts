/** Plug-ins bundled with the CLI. The application wires plug-ins; the core never imports them (ADR-0005). */
import type { PluginModule } from "@designperspectives/contracts";
import likec4 from "@designperspectives/plugin-model-likec4";

export const BUILTIN_PLUGINS: PluginModule[] = [likec4];
