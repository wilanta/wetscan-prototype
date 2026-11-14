export interface Repository {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}
export interface Profile {
  githubId: number;
  login: string;
  workspace: string;
  installationId?: number;
  repositories: Repository[];
  email: string;
  securityNotifications: boolean;
  productUpdates: boolean;
  completedAt?: string;
}
export interface InstallationChoice {
  id: number;
  account: string;
}
export interface Session {
  expiresAt: number;
  workspace: string;
  githubId?: number;
  userToken?: string;
  tokenExpiresAt?: number;
  refreshToken?: string;
  installationChoices?: InstallationChoice[];
  flow?: {
    state: string;
    expiresAt: number;
    kind: "install" | "login" | "verify" | "connect";
    verifier?: string;
    installationId?: number;
  };
}
export interface OnboardingState {
  authenticated: boolean;
  step: "workspace" | "github" | "repositories" | "account" | "complete";
  profile: Pick<
    Profile,
    | "login"
    | "workspace"
    | "email"
    | "securityNotifications"
    | "productUpdates"
    | "repositories"
  >;
  connected: boolean;
  installations?: InstallationChoice[];
}
