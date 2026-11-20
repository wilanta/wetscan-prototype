// Dev-time crawler: clicks every interactive control on every route and reports ones with no observable effect.
import { test } from "@playwright/test";
import fs from "node:fs";
import { enter, PROJECT } from "./helpers";
const routes = (process.env.AUDIT_ROUTES ?? [
  "/app", "/app/projects", "/app/activity", "/app/notifications", "/app/integrations", "/app/reports", "/app/settings",
  PROJECT, PROJECT + "/canvas", PROJECT + "/guard", PROJECT + "/guard/scans", PROJECT + "/guard/findings", PROJECT + "/guard/findings/FIND-102",
  PROJECT + "/guard/inventory", PROJECT + "/guard/releases", PROJECT + "/guard/integrity", PROJECT + "/guard/remediation",
  PROJECT + "/sentinel", PROJECT + "/sentinel/activity", PROJECT + "/sentinel/incidents", PROJECT + "/sentinel/responses",
  PROJECT + "/sentinel/ghost", PROJECT + "/sentinel/intelligence",
].join(",")).split(",");
const sel = 'button:not([disabled]), [role="button"], [role="tab"], [role="switch"], [role="checkbox"], input[type="checkbox"], input[type="radio"], select, summary';
test("audit interactive controls", async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await enter(page);
  const report: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const route of routes) {
    const res = await page.goto(route);
    await page.waitForLoadState("networkidle").catch(() => {});
    const entry: Record<string, unknown> = { route, status: res?.status(), url: page.url(), h1: await page.locator("h1").first().textContent().catch(() => null) };
    // Links
    const links = await page.$$eval("a[href]", (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))]);
    const bad: string[] = [];
    for (const href of links) {
      if (/^(mailto:|tel:|#|javascript:)/.test(href)) { if (href === "#") bad.push("#"); continue; }
      if (/^https?:/.test(href)) continue;
      const r = await page.request.get(href, { maxRedirects: 5 }).catch(() => null);
      if (!r || r.status() >= 400) bad.push(`${href} -> ${r?.status()}`);
    }
    entry.badLinks = bad;
    const scope = route === "/app" ? "" : "#main ";
    const S = sel.split(", ").map((x) => scope + x).join(", ");
    const count = await page.locator(S).count();
    entry.controls = count;
    const dead: string[] = [];
    for (let i = 0; i < count; i++) {
      await page.goto(route);
      await page.waitForLoadState("networkidle").catch(() => {});
      const el = page.locator(S).nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const label = ((await el.getAttribute("aria-label")) || (await el.innerText().catch(() => "")) || (await el.getAttribute("name")) || (await el.getAttribute("title")) || "?").replace(/\s+/g, " ").slice(0, 60);
      const snap = () => page.evaluate(() => document.body.innerText.length + "|" + document.querySelectorAll('[role="dialog"]').length + "|" + document.querySelectorAll("[data-sonner-toast]").length + "|" + [...document.querySelectorAll("input,select,textarea")].map((e) => (e as HTMLInputElement).value + (e as HTMLInputElement).checked).join(",") + "|" + document.querySelectorAll("[aria-selected=true],[aria-pressed=true],[aria-expanded=true],.active").length + "|" + document.documentElement.dataset.theme + "|" + document.body.innerHTML.length);
      const before = await snap(); const url0 = page.url();
      try { await el.click({ timeout: 3000, trial: false }); } catch (e) { dead.push(`${i}:${label} [CLICK-FAIL ${String(e).split("\n")[0].slice(0, 80)}]`); continue; }
      await page.waitForTimeout(250);
      const after = await snap();
      if (before === after && page.url() === url0) dead.push(`${i}:${label}`);
    }
    entry.dead = dead;
    report.push(entry);
    console.log(JSON.stringify(entry));
  }
  fs.writeFileSync(process.env.AUDIT_OUT ?? "test-results/ui-audit.json", JSON.stringify({ report, errors }, null, 2));
});
