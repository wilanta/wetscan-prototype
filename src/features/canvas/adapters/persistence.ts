import type { CanvasPersistencePort } from "../contracts";
import type { UserCanvasOverlay } from "../types";
import { validateOverlay } from "../validation";
import { demoProjectRef } from "./demo-source";
export class MemoryCanvasPersistence implements CanvasPersistencePort {
  private values = new Map<string, UserCanvasOverlay>();
  async load(projectRef: string) {
    const value = this.values.get(projectRef);
    return value ? structuredClone(value) : null;
  }
  async save(projectRef: string, overlay: UserCanvasOverlay) {
    this.values.set(projectRef, validateOverlay(overlay, projectRef));
  }
  async reset(projectRef: string) {
    this.values.delete(projectRef);
  }
}
// Volatile tab memory only; graph data and credentials are never persisted here.
const sessionOverlays = new Map<string, MemoryCanvasPersistence>();
export function sessionCanvasPersistence(scope: string) {
  let port = sessionOverlays.get(scope);
  if (!port) {
    if (sessionOverlays.size >= 12)
      sessionOverlays.delete(sessionOverlays.keys().next().value!);
    port = new MemoryCanvasPersistence();
    sessionOverlays.set(scope, port);
  }
  return port;
}
/** Demo annotations only. No generated source, findings or incidents are stored. CAN-004. */
export class DemoCanvasPersistence implements CanvasPersistencePort {
  private key(projectRef: string) {
    if (projectRef !== demoProjectRef)
      throw new Error("Browser persistence is demo-only");
    return "wetscan:canvas:annotations:v1:demo";
  }
  async load(projectRef: string) {
    const key = this.key(projectRef);
    const data = localStorage.getItem(key);
    if (!data) return null;
    if (data.length > 2_000_000)
      throw new Error("Oversized stored annotation document");
    return validateOverlay(JSON.parse(data), projectRef);
  }
  async save(projectRef: string, overlay: UserCanvasOverlay) {
    const key = this.key(projectRef);
    localStorage.setItem(
      key,
      JSON.stringify(validateOverlay(overlay, projectRef)),
    );
  }
  async reset(projectRef: string) {
    const key = this.key(projectRef);
    localStorage.removeItem(key);
  }
}
