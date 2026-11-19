import { describe, expect, it } from "vitest";
import pg from "pg";

// Importing the setup module has the same effect as listing it in a vitest `setupFiles` entry.
await import("./pg-idle-error-setup");
const idleError = (code: string, message = "boom") =>
  Object.assign(new Error(message), { code });

describe("PG harness idle-pool error guard", () => {
  it.each(["57P01", "ECONNRESET", "EPIPE"])(
    "tolerates the teardown-class error %s on an idle pooled connection",
    (code) => {
      const pool = new pg.Pool({ host: "127.0.0.1", port: 1 });
      expect(() => pool.emit("error", idleError(code))).not.toThrow();
    },
  );
  it.each(["23505", "42501", "28P01", "57P03", ""])(
    "still throws every other pool error (code %j), so real database faults are never masked",
    (code) => {
      const pool = new pg.Pool({ host: "127.0.0.1", port: 1 });
      expect(() => pool.emit("error", idleError(code, "real fault"))).toThrow(
        "real fault",
      );
    },
  );
  it("applies to pools created through the default export, as the platform ApprovedPool does", () => {
    expect(
      new pg.Pool({ host: "127.0.0.1", port: 1 }).listenerCount("error"),
    ).toBe(1);
  });
});
