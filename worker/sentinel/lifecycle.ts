import type { EventEmitter } from "node:events";
import type { Server } from "node:http";

export type ShutdownReason =
  | "SIGINT"
  | "SIGTERM"
  | "SIGBREAK"
  | "parent_request"
  | "parent_disconnected"
  | "acceptance_expired"
  | "acceptance_failure"
  | "completed";
export type WorkerControl = Pick<EventEmitter, "on" | "removeListener"> & {
  connected?: boolean;
  disconnect?: () => void;
};

/** A private inherited Node IPC channel is a parent capability, not a network API. */
export class ShutdownCoordinator {
  private readonly controller = new AbortController();
  private readonly listeners: [string, (...args: unknown[]) => void][] = [];
  private finishing?: Promise<void>;
  readonly signal = this.controller.signal;
  constructor(
    private readonly control: WorkerControl,
    onRequest: (reason: ShutdownReason) => void,
    platform: NodeJS.Platform = process.platform,
  ) {
    this.request = (reason) => {
      if (this.signal.aborted) return;
      this.controller.abort();
      onRequest(reason);
    };
    const listen = (event: string, handler: (...args: unknown[]) => void) => {
      control.on(event, handler);
      this.listeners.push([event, handler]);
    };
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      listen(signal, () => this.request(signal));
    if (platform === "win32")
      listen("SIGBREAK", () => this.request("SIGBREAK"));
    // Only children explicitly forked with an inherited channel accept messages.
    if (control.connected) {
      listen("message", (message) => {
        const value = message as { type?: unknown; version?: unknown } | null;
        if (value?.type === "sentinel.shutdown" && value.version === 1)
          this.request("parent_request");
      });
      listen("disconnect", () => this.request("parent_disconnected"));
    }
  }
  request: (reason: ShutdownReason) => void;
  finish(cleanup: () => Promise<void>) {
    return (this.finishing ??= Promise.resolve().then(cleanup));
  }
  dispose() {
    for (const [event, listener] of this.listeners)
      this.control.removeListener(event, listener);
    if (this.control.connected) this.control.disconnect?.();
  }
}

/** Also disposes its deadline timer when work settles or fails. */
export async function within<T>(
  work: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("shutdown_deadline")),
          Math.max(1, milliseconds),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function closeHealthServer(server: Server) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => server.closeAllConnections(), 1000);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
    server.closeIdleConnections();
  });
}
