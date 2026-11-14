import type { Page } from "@playwright/test";

export async function mapAction(page: Page, name: string) {
  const summary = page.getByText("Map tools", { exact: true });
  const disclosure = summary.locator("..");
  if (!(await disclosure.getAttribute("open"))) {
    // Native details uses an empty attribute when open.
    if (
      !(await disclosure.evaluate(
        (element) => (element as HTMLDetailsElement).open,
      ))
    )
      await summary.click();
  }
  await page.getByRole("button", { name, exact: true }).click();
  if (
    await disclosure.evaluate((element) => (element as HTMLDetailsElement).open)
  )
    await summary.click();
}

export async function inspectorEdits(page: Page) {
  const details = page.locator(".canvas-inspector-tools");
  if (
    !(await details.evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await details.locator("summary").click();
  }
}

export async function filters(page: Page) {
  const summary = page
    .locator(".component-explorer summary")
    .filter({ hasText: "Filters" });
  if (
    !(await summary
      .locator("..")
      .evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await summary.click();
}
