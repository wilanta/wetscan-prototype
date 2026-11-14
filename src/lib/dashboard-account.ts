// Presentation only: consumes the existing /api/onboarding public profile.
// Never include session credentials or create a second account data source.
export interface DashboardAccount {
  login: string;
  email: string;
  workspace: string;
  initials: string;
  workspaceInitial: string;
  connected: boolean;
  repositoriesAvailable: boolean;
  repositories: {
    id: number;
    fullName: string;
    defaultBranch: string;
    private: boolean | null;
  }[];
}
function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
export function dashboardAccount(
  profile?: unknown,
  connected?: unknown,
): DashboardAccount {
  const data =
    profile && typeof profile === "object"
      ? (profile as Record<string, unknown>)
      : {};
  const login = text(data.login, "User unavailable");
  const workspace = text(data.workspace, "Workspace unavailable");
  const repositories = new Map<
    number,
    DashboardAccount["repositories"][number]
  >();
  if (Array.isArray(data.repositories)) {
    for (const value of data.repositories) {
      if (!value || typeof value !== "object") continue;
      const repo = value as Record<string, unknown>;
      if (
        !Number.isSafeInteger(repo.id) ||
        Number(repo.id) < 1 ||
        !text(repo.fullName, "")
      )
        continue;
      repositories.set(Number(repo.id), {
        id: Number(repo.id),
        fullName: text(repo.fullName, "Repository unavailable"),
        defaultBranch: text(repo.defaultBranch, "Branch unavailable"),
        private: typeof repo.private === "boolean" ? repo.private : null,
      });
    }
  }
  return {
    login,
    workspace,
    email: text(data.email, "Email not provided"),
    initials: text(data.login, "")
      ? Array.from(login).slice(0, 2).join("").toUpperCase()
      : "?",
    workspaceInitial: text(data.workspace, "")
      ? Array.from(workspace)[0].toUpperCase()
      : "?",
    repositoriesAvailable: Array.isArray(data.repositories),
    connected: connected === true,
    repositories: [...repositories.values()],
  };
}
