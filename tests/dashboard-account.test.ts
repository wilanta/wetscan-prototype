import { describe, expect, it } from "vitest";
import { dashboardAccount } from "../src/lib/dashboard-account";
describe("dashboard account presentation", () => {
  it("uses the actual saved profile without inventing an avatar or display name", () => {
    expect(
      dashboardAccount(
        {
          login: "real-user",
          email: "real@example.test",
          workspace: "Actual workspace",
          repositories: [
            {
              id: 101,
              fullName: "owner/private",
              defaultBranch: "release",
              private: true,
            },
          ],
        },
        true,
      ),
    ).toEqual({
      login: "real-user",
      email: "real@example.test",
      workspace: "Actual workspace",
      initials: "RE",
      workspaceInitial: "A",
      connected: true,
      repositoriesAvailable: true,
      repositories: [
        {
          id: 101,
          fullName: "owner/private",
          defaultBranch: "release",
          private: true,
        },
      ],
    });
  });
  it.each([undefined, null, {}, "invalid", 17])(
    "provides explicit placeholders for unavailable input (%s)",
    (input) => {
      expect(dashboardAccount(input)).toMatchObject({
        login: "User unavailable",
        email: "Email not provided",
        workspace: "Workspace unavailable",
        initials: "?",
        workspaceInitial: "?",
        repositories: [],
        repositoriesAvailable: false,
      });
    },
  );
  it("handles empty fields and malformed repository records without render errors", () => {
    const account = dashboardAccount(
      {
        login: " ",
        email: {},
        workspace: null,
        repositories: [
          null,
          {},
          { id: "1", fullName: "wrong/id" },
          { id: 2, fullName: "owner/api" },
          { id: 2, fullName: "owner/api" },
        ],
      },
      true,
    );
    expect(account.login).toBe("User unavailable");
    expect(account.email).toBe("Email not provided");
    expect(account.workspace).toBe("Workspace unavailable");
    expect(account.repositories).toEqual([
      {
        id: 2,
        fullName: "owner/api",
        defaultBranch: "Branch unavailable",
        private: null,
      },
    ]);
  });
  it("does not project credentials or unrelated server fields into dashboard state", () => {
    const account = dashboardAccount({
      login: "user",
      userToken: "fixture-only-user-credential",
      refreshToken: "fixture-only-refresh",
      privateKey: "fixture-only-key",
      repositories: [],
    });
    expect(Object.keys(account)).not.toContain("userToken");
    expect(JSON.stringify(account)).not.toContain("fixture-only");
  });
  it("distinguishes an empty repository selection from unavailable repository data", () => {
    expect(dashboardAccount({ repositories: [] }).repositoriesAvailable).toBe(
      true,
    );
    expect(dashboardAccount({ repositories: null }).repositoriesAvailable).toBe(
      false,
    );
  });
});
