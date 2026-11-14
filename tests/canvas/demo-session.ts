import type { Page } from "@playwright/test";

// UI-only identity fixture for the isolated host. Real session/OAuth checks run
// separately through tests/auth/run-github-e2e.mjs and the production proxy.
export async function mockDemoAccount(page: Page) {
  await page.route("**/api/onboarding", (route) =>
    route.fulfill({
      json: {
        authenticated: true,
        step: "complete",
        connected: true,
        profile: {
          login: "reviewer",
          workspace: "Northstar Studio",
          repositories: [],
          email: "reviewer@example.test",
          securityNotifications: true,
          productUpdates: false,
        },
      },
    }),
  );
}
