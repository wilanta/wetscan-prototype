import { expect, test } from "@playwright/test";
test("form validation survives delayed initial loading and clears after valid submission", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const scope = window as unknown as {
      __s03Race: { release(): void; pending(): number };
      setTimeout(
        handler: TimerHandler,
        delay?: number,
        ...args: unknown[]
      ): number;
      clearTimeout(id: number | undefined): void;
    };
    const schedule = scope.setTimeout.bind(window),
      cancel = scope.clearTimeout.bind(window);
    let holding = true;
    const waiting = new Map<number, () => void>();
    scope.setTimeout = (
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay !== 150 || typeof handler !== "function")
        return schedule(handler, delay, ...args);
      const id = schedule(() => {
        if (holding) waiting.set(id, () => handler(...args));
        else handler(...args);
      }, delay);
      return id;
    };
    scope.clearTimeout = (id) => {
      if (id !== undefined) waiting.delete(id);
      cancel(id);
    };
    scope.__s03Race = {
      pending: () => waiting.size,
      release: () => {
        holding = false;
        const tasks = [...waiting.values()];
        waiting.clear();
        for (const task of tasks) task();
      },
    };
  });
  let writes = 0;
  await page.route(
    "**/api/sentinel/projects/github-123/rules",
    async (route) => {
      if (route.request().method() === "POST") writes++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rules: [] }),
      });
    },
  );
  await page.goto("/app/detection-fixture");
  await page
    .getByText("Matching conditions and suppression windows", { exact: true })
    .click();
  await page.getByLabel("Conditions JSON").fill("not json");
  await page.getByRole("button", { name: "Save draft" }).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("valid JSON");
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __s03Race: { pending(): number } }
      ).__s03Race.pending() > 0,
  );
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname ===
          "/api/sentinel/projects/github-123/rules" &&
        r.request().method() === "GET",
    ),
    page.evaluate(() =>
      (
        window as unknown as { __s03Race: { release(): void } }
      ).__s03Race.release(),
    ),
  ]);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.json()).toEqual({ rules: [] });
  await expect(
    page.getByRole("button", { name: "Refresh detections" }),
  ).toBeEnabled();
  await expect(alert).toContainText("valid JSON");
  expect(writes).toBe(0);
  await test.info().attach("sanitized-loading-response", {
    body: Buffer.from(
      JSON.stringify({
        status: response.status(),
        contentType: "application/json",
        body: { rules: [] },
        invalidInputWrites: writes,
        dependency: "controlled fixture",
      }),
    ),
    contentType: "application/json",
  });
  await page
    .getByLabel("Conditions JSON")
    .fill(
      JSON.stringify([{ field: "request.statusCode", op: "gte", value: 400 }]),
    );
  const saved = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/sentinel/projects/github-123/rules" &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save draft" }).click();
  await saved;
  await expect(alert).toHaveCount(0);
  expect(writes).toBe(1);
});
