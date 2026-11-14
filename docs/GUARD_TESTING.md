# Guard testing and repeatable verification

Run from repository root. Existing installed/locked Node dependencies were reused; `npm ci` was not rerun and dependency manifests/lockfile were not changed. PowerShell policy blocks npm.ps1, so commands use npm.cmd/npx.cmd. No dotenv file was opened. Every Next build/browser server below preloads the existing skip-dotenv hook and uses isolated synthetic Auth config, with generated keys never printed. Test server Auth data is cleaned up afterward.

## Executed checks

| Check                                            | Result                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Baseline npm.cmd test                            | 99/99 passing, 7 files                                                                                        |
| Baseline typecheck / lint                        | Passing                                                                                                       |
| Final npm.cmd test                               | 158/158 passing, 10 files (59 new tests)                                                                      |
| Final npm.cmd run typecheck                      | Passing                                                                                                       |
| Final npm.cmd run lint                           | Passing                                                                                                       |
| Next production build, via isolated Guard runner | Passing                                                                                                       |
| Real scanner suite                               | 4/4 passing; actual pinned Windows CLI processes                                                              |
| Guard E2E                                        | 4/4 passing, Microsoft Edge; no fixture modifications to old Auth tests                                       |
| Existing Auth/dashboard E2E                      | 17/17 passing, unchanged existing runner/fixtures                                                             |
| Screenshot inspection                            | 1440 and 1280 light, 390 dark; existing components/colors/layout preserved; contained table horizontal scroll |
| Accessibility                                    | Workbench axe WCAG 2A/AA/2.1AA, keyboard dialog opening/Escape, no page overflow at 1280/390                  |
| Diff whitespace                                  | git diff --check passing                                                                                      |

## Commands

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
# Explicit local-only tool setup, pinned official assets and SHA256 verification.
# The execution-policy flag applies to this process only, not a machine policy change.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/guard/setup-tools.ps1
npx.cmd vitest run --config tests/guard/scanner.config.ts
# Builds Next without dotenv, serves isolated Auth fixture on unused port 3109,
# then runs tests/guard/playwright.config.ts and disposes synthetic Auth data.
node tests/guard/run-e2e.mjs
# Original Auth/dashboard regression suite; separate runner, ports 3107..3109.
node tests/auth/run-github-e2e.mjs
```

Do not run the two browser runners concurrently: they intentionally share isolated port 3109 and the build output. The scanner integration suite is intentionally separate from default Vitest so a missing local binary or offline advisory service cannot silently become fake evidence. Missing binary/checksum/network fails the explicit suite; no fallback results are fabricated. Setup does not run during production jobs and never uses mutable latest downloads.

For the existing development UI, use `npm.cmd run dev` with your normal existing Auth configuration managed yourself, then authenticate and open `/app/projects/orderly-demo/guard`. No additional Guard credentials are required for Demo. Do not enable a customer-code worker based on these fixture commands.

## Actual scanner evidence

### opengrep 1.33.1

Evidence: `tests/guard/evidence/opengrep-verification.json`. Pin/checksum, durations, source/rule versions, normalized findings and recorded time are captured.

- vulnerable.js: exit 0; 1 normalized findings.
- fixed.js: exit 0; 0 normalized findings.

### gitleaks 8.30.1

Evidence: `tests/guard/evidence/gitleaks-verification.json`. Pin/checksum, durations, source/rule versions, normalized findings and recorded time are captured.

- exposed.js: exit 1; 1 normalized findings.
- clean.js: exit 0; 0 normalized findings.

### osv 2.7.1

Evidence: `tests/guard/evidence/osv-verification.json`. Pin/checksum, durations, source/rule versions, normalized findings and recorded time are captured.

- vulnerable: exit 1; 2 normalized findings.
- fixed: exit 0; 0 normalized findings.

### trivy 0.76.2

Evidence: `tests/guard/evidence/trivy-verification.json`. Pin/checksum, durations, source/rule versions, normalized findings and recorded time are captured.

- vulnerable: exit 0; 7 normalized findings; 4 targeted public-access matches.
- fixed: exit 0; 3 normalized findings; 0 targeted public-access matches.

Opengrep uses one project-owned eval rule. Gitleaks uses a nonfunctional synthetic marker/custom rule and CLI redaction; matched values/source excerpts are never stored. OSV queries public advisory metadata for minimist 0.0.8/1.2.8 with dependency resolution and all call analysis disabled; no package is installed. Its fallback severity is medium pending CVSS review. Trivy uses the embedded pinned checks with update disabled, never applies Terraform; its controlled assertion is about public-access checks only, retaining unrelated findings. Fixture content hashes are versions of static test files, not Git commit claims.

Raw reports are parsed in temporary fixture workspaces and disposed. Evidence files retain normalized redacted results and artifact hashes; they are not a durable raw-artifact archive. No user repository, actual secret, private key, payment action or staging endpoint was tested. No live DAST/CI/AI verification is claimed.

## Failures encountered and resolved

- PowerShell execution policy blocks npm.ps1 and direct .ps1 invocation. npm.cmd and explicitly scoped setup process invocation were verified; no machine policy change.
- Opengrep native Windows CLI does not support the Python CLI --metrics option. Harness uses supported native flags plus local rules/version check disabled; no remote rule download. Metrics-off environment requests are not network enforcement.
- Replacing USERPROFILE with the temporary workspace crashed the native scanner (3221226505), even on --version. Minimal-environment isolation established that variable as the trigger. It is now omitted (not inherited), HOME/AppData/temp are fixture-scoped, and actual positive/negative harness runs pass.
- Real OSV output uses null/absent vulnerabilities for clean packages. Parser explicitly treats those as no matches, while rejecting malformed arrays and objects.
- Trivy emits a module-level target. The trusted single-file harness only rewrites an exact known fixture/module target; arbitrary paths still fail validation. A standalone access-block resource without a bucket produced zero failures, so the fixture now explicitly references its synthetic bucket. No such zero was accepted as a successful positive test.

Worker unit tests cover expired/cross-workspace/project/mode grants, invalid state transitions, idempotency mismatch, binary/size/traversal/symlink exclusions, timeout, cancellation, missing sandbox before source acquisition, immutable commit and evidence mismatch, absent/failed/skipped/not-applicable coverage, secret/ANSI/HTML sanitation, unknown licenses, audit reason, conservative retest, policy coverage, no fabricated deliveries, AI-off fallback and five invariant models. Some production limits are contracts awaiting platform enforcement, not locally verified isolation.

## License and rule provenance

- Opengrep: [pinned release](https://github.com/opengrep/opengrep/releases/tag/v1.33.1), [license](https://github.com/opengrep/opengrep/blob/v1.33.1/LICENSE) (LGPL-2.1).
- Gitleaks: [pinned release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), [license](https://github.com/gitleaks/gitleaks/blob/v8.30.1/LICENSE) (MIT).
- OSV: [pinned release](https://github.com/google/osv-scanner/releases/tag/v2.7.1), [license](https://github.com/google/osv-scanner/blob/v2.7.1/LICENSE) (Apache-2.0); advisory dataset version is time-dependent and identified by recorded output hash/time.
- Trivy: [pinned release](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2), [license](https://github.com/aquasecurity/trivy/blob/v0.76.2/LICENSE) (Apache-2.0); checks are embedded in the checksum-pinned binary, not mutable downloaded packs.

SAST/secret test rules are project-owned. Binaries remain outside the repository under versioned TEMP folders. Distribution, notices, container images and production rule-pack deployment rights still require owner review before shipping workers. Scanner availability does not prove production isolation or safe tenant execution.
