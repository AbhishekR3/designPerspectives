// Type contract for the single exposed IPC call (shared by preload, renderer and main in the real app).
export interface PingRequest { text: string }
export interface PingResponse { echo: string; pid: number; length: number }
export interface DpBridge {
  ping(text: string): Promise<PingResponse>;
  report(results: unknown): Promise<boolean>;
  env: { sandboxed: boolean; contextIsolated: boolean; preloadFsRequire: string };
}
declare global { interface Window { dp: DpBridge } }
