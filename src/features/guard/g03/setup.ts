import { isAbsolute } from "node:path";
import { G03Error } from "./contracts";
import { object, assertPublic } from "./safety";

/** Non-secret settings only. A key VALUE is never part of this schema. */
export interface ProviderSettings {
  version: 1;
  enabled: boolean;
  provider: "openai_responses";
  model: string;
  inputMicroUsdPerMillion: number;
  outputMicroUsdPerMillion: number;
  dataPolicyApproved: boolean;
  dataPolicyVersion: string;
  keyFile: string | null;
}
const keys = [
  "version",
  "enabled",
  "provider",
  "model",
  "inputMicroUsdPerMillion",
  "outputMicroUsdPerMillion",
  "dataPolicyApproved",
  "dataPolicyVersion",
  "keyFile",
];
export function providerSettings(value: unknown): ProviderSettings {
  const s = object(value, keys);
  const rate = (v: unknown) =>
    typeof v === "number" &&
    Number.isSafeInteger(v) &&
    v >= 1 &&
    v <= 1_000_000_000;
  if (
    s.version !== 1 ||
    typeof s.enabled !== "boolean" ||
    s.provider !== "openai_responses" ||
    typeof s.model !== "string" ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(s.model) ||
    !rate(s.inputMicroUsdPerMillion) ||
    !rate(s.outputMicroUsdPerMillion) ||
    typeof s.dataPolicyApproved !== "boolean" ||
    typeof s.dataPolicyVersion !== "string" ||
    !/^[a-zA-Z0-9._-]{1,120}$/.test(s.dataPolicyVersion) ||
    (s.keyFile !== null &&
      (typeof s.keyFile !== "string" ||
        !isAbsolute(s.keyFile) ||
        /(?:^|[/\\])\.env(?:\.|$)|[\r\n\0]/i.test(s.keyFile)))
  )
    throw new G03Error("invalid_provider_settings", 400);
  const settings = s as unknown as ProviderSettings;
  assertPublic(settings.model);
  assertPublic(settings.dataPolicyVersion);
  if (settings.enabled && (!settings.dataPolicyApproved || !settings.keyFile))
    throw new G03Error("provider_approval_required", 403);
  if (settingsPlan(settings).reservedMicroUsd > 100000)
    throw new G03Error("provider_cost_limit", 429);
  return settings;
}
export function settingsPlan(s: ProviderSettings) {
  return {
    provider: s.provider,
    model: s.model,
    maxInputTokens: 10000,
    maxOutputTokens: 2000,
    timeoutMs: 20000,
    retries: 0,
    reservedMicroUsd: Math.ceil(
      (10000 * s.inputMicroUsdPerMillion + 2000 * s.outputMicroUsdPerMillion) /
        1_000_000,
    ),
    maxProjectMicroUsdPer24Hours: 500000,
    maxProjectRequestsPer24Hours: 20,
    maxActorRequestsPerMinute: 1,
  };
}
/** Applied by an owner to the existing server process, never an activation command. */
export function settingsEnvironment(
  s: ProviderSettings,
): Record<string, string> {
  providerSettings(s);
  return {
    GUARD_G03_AI_ENABLED: s.enabled ? "1" : "0",
    GUARD_G03_PROVIDER: s.provider,
    GUARD_G03_MODEL: s.model,
    GUARD_G03_INPUT_MICRO_USD_PER_MILLION: String(s.inputMicroUsdPerMillion),
    GUARD_G03_OUTPUT_MICRO_USD_PER_MILLION: String(s.outputMicroUsdPerMillion),
    GUARD_G03_DATA_POLICY_APPROVED: s.dataPolicyApproved ? "1" : "0",
    GUARD_G03_DATA_POLICY_VERSION: s.dataPolicyVersion,
    ...(s.keyFile ? { GUARD_G03_API_KEY_FILE: s.keyFile } : {}),
  };
}
