/** Typed access to the preload bridge. The renderer has no other way to reach the host (FF12). */
import type { DesktopApi } from "../shared/ipc.js";

declare global {
  interface Window {
    dp: DesktopApi;
  }
}

export const dp = (): DesktopApi => window.dp;
