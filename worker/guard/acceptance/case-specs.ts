import type { CaseId } from "./catalog";
import { makeProbeSpec, type ProbeControl } from "./probe-spec";
/** One reviewed mode per physical container. No caller-provided executable, argv, delay or endpoint. */
export function caseSpecs(caseId: CaseId, program: string) {
  const make = (
    mode: ProbeControl["mode"] = "manifest",
    holdMs = 0,
    timeoutMs = 5000,
  ) => makeProbeSpec(program, { mode, holdMs }, timeoutMs);
  switch (caseId) {
    case "Q00":
      return [
        make("controls"),
        make("output"),
        make("hold", 120000, 1500),
        make("hold", 120000),
        make("memory"),
        make("hold", 120000, 1500),
      ];
    case "N00":
      return [make()];
    case "I01":
    case "N07":
      return [make()];
    case "N02":
      return [make("hold", 10000, 15000)];
    case "N03":
      return [make("hold", 120000, 120000)];
    case "N05":
      return [make("hold", 120000, 1500)];
    case "C01":
      return [make("hold", 10000, 15000), make()];
    case "C02A":
      return [make("hold", 120000, 120000), make()];
    default:
      return [];
  }
}
