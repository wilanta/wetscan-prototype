# Validation and handoff

Verified locally on **13 November 2026 (WIB)** using Node.js 22.20.0 and the production Next.js server at `http://localhost:3000`.

| Check | Observed result |
| --- | --- |
| Dependency installation | Completed; pinned package-lock.json |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed without warnings |
| `npm test` | 9 of 9 domain tests passed |
| `npm run build` | Passed; static entry pages and dynamic validated application routes |
| `npm run test:e2e` | 6 of 6 Chromium scenarios passed; final run 45.5 seconds |
| `npm audit` | 0 vulnerabilities reported |
| Responsive checks | Overview and Canvas at 1440×900, 1280×900, 390×844; no document overflow |
| Automated accessibility | No violations in the scoped WCAG 2 A/AA and 2.1 AA axe checks |
| Browser runtime errors | None observed during the additional interaction scenario |

The six browser scenarios cover the complete primary walkthrough and reset; failed/pending verification; GitLab demo onboarding; responsive and dark-theme checks; declared routes, staging validation, Canvas lenses/list view and dialog Escape/focus restoration; simulated scan loading/success, graph zoom/fit, edge pointer selection, direct node keyboard selection, mobile navigation, and representative additional accessibility checks.

Accessibility coverage: Overview and Canvas at all three target widths, dark Overview at 1440, and landing, finding detail, Sentinel overview, Notifications, Integrations, and onboarding at 1440. This is automated scoped evidence plus rendered screenshot review, not an independent accessibility certification. Screen-reader user testing, touch hardware, Firefox and Safari are not verified.

## Artifacts

- `evidence/overview-1440.png`, `overview-1280.png`, `overview-390.png`
- `evidence/canvas-1440.png`, `canvas-1280.png`, `canvas-390.png`
- `evidence/overview-dark-1440.png`
- `evidence/canvas-inspector-1440.png`
- `evidence/landing-1440.png`, `finding-1440.png`, `scan-loading-1440.png`
- `evidence/accessibility.json`, `interaction-checks.json`, `design-review.json`
- A rerunnable HTML test report is generated under ignored `playwright-report/`.

The final production preview is left running locally. The workspace was initially a standalone folder with the blueprint, without a Git repository; no commit, push, hosted deployment, or CI result is claimed.

## Product boundaries

The approved Google Doc was readable through the connected Google Drive plugin and informed the scope. Reference folder metadata was readable, but competitor screenshot pixels are not claimed as inspected visual evidence.

Security behavior is entirely synthetic. No actual OAuth grant, repository access, scan, DAST request, runtime telemetry, response enforcement, LLM call, notification provider acceptance/delivery, or production rule deployment occurred. The browser tests validate local UI and domain behavior. AI has no selected provider or model. Indonesian localization, pricing, real integrations, and advanced Ghost isolation remain deferred as documented in README.
