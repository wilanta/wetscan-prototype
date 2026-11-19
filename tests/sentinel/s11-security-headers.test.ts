import { describe, expect, it } from "vitest";
import config, { securityHeaders } from "../../next.config";

describe("S11 baseline security headers", () => {
  const byKey = Object.fromEntries(
    securityHeaders.map((h) => [h.key, h.value]),
  );
  it("applies to every route", async () => {
    const rules = await config.headers!();
    expect(rules).toEqual([{ source: "/:path*", headers: securityHeaders }]);
  });
  it("blocks framing, MIME sniffing and plugin content", () => {
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Content-Security-Policy"]).toMatch(/frame-ancestors 'none'/);
    expect(byKey["Content-Security-Policy"]).toMatch(/object-src 'none'/);
    expect(byKey["Permissions-Policy"]).toMatch(/camera=\(\)/);
  });
  it("does not claim a script CSP it cannot enforce without nonces", () => {
    expect(byKey["Content-Security-Policy"]).not.toMatch(
      /script-src|default-src/,
    );
  });
});
