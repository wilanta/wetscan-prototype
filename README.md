# WetScan 2.0 interactive prototype

A local application-security workspace with Canvas, Guard and Sentinel demo flows. The existing GitHub App authentication and onboarding also connect selected real repositories to source-backed Canvas discovery. Guard/Sentinel scanning and runtime protection remain unavailable for real projects. See [local GitHub integration and acceptance evidence](docs/CANVAS_GITHUB_INTEGRATION.md).

## Run locally (PowerShell)

Requirements: Node.js 22.20+ and npm. Preserve your existing `.env.local`; for a new setup, copy `.env.example` and configure the existing GitHub App and encrypted local auth store as described in [AUTH-ONBOARDING.md](docs/AUTH-ONBOARDING.md). From this folder:

```powershell
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in and finish onboarding. In `/app/projects`, select **Open Canvas** for an authorized GitHub repository, or open Orderly Demo separately. `/app` and its deep links require the existing completed session. To use a production preview:

```powershell
npm run build
npm start
```

Run only one server on port 3000 at a time. All fonts are bundled locally. Dependencies are version-pinned with a lockfile. The scoped minimatch override resolves the lint toolchain's moderate advisory without downgrading Next.js.

## Two-minute demo

1. Landing → demo workspace → Projects → Orderly Demo → Canvas.
2. Select **Orders API**, then **View evidence** to open **FIND-102**.
3. Review the synthetic cross-customer request. Show the **example remediation**, use it in the demo scenario, and run a **simulated retest**.
4. Open Sentinel. **Simulate suspicious request** creates **INC-1042** and the enabled detection notification previews.
5. Open the incident. Evaluate the policy and apply the demo action, then request verification. It remains **verification pending** with no success preview.
6. Choose the synthetic verification outcome. Passing records **EV-VERIFY** (replay 429, control 200) and creates separate scope-limited outcome previews. Failed and pending paths make no neutralization claim.
7. Archive the case → Intelligence. **RULE-CAND-02** is a draft; reviewing and explicitly approving it changes demo status only.
8. Sentinel → Ghost → enable the demo decoy → test it. **GHOST-03** produces `ghost.decoy_triggered` and its own linked incident.
9. Notifications shows Telegram, email, WhatsApp, per-trigger preferences, preview logs, and unconfirmed delivery. Reports offers copy and browser printing.
10. **Reset demo** restores every domain setting and fixture. A full browser reload also resets in-memory state.

## Demo behavior and historical prototype scope

The following table describes the original demo. Current GitHub authentication, onboarding and real source discovery are implemented separately; see [CANVAS_GITHUB_INTEGRATION.md](docs/CANVAS_GITHUB_INTEGRATION.md). Source observations never establish runtime verification.

| Working locally                                                                       | Deliberately simulated or unavailable                                       |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Routes, navigation, forms, filters, React Flow pan/zoom and selection                 | Architecture data is an authored fixture, not automatic discovery           |
| Accessible dialogs, keyboard controls, light/dark themes, phone component list        | OAuth, repository access, auth backend, production integrations             |
| Deterministic incident transitions, failure/pending paths, scoped verification events | Scan engines, DAST, network traffic, runtime telemetry, firewall rules      |
| Trigger/channel preference logic, deduplicated preview records                        | Telegram/email/WhatsApp API calls, recipient delivery, provider credentials |
| Example remediation, workflow fixture test, draft rule approval                       | AI calls, automatic file changes, pull requests, deployed rules             |
| Copy summary and print-friendly report                                                | Pentest certification or production security assurance                      |

Within Orderly Demo, people, repositories, commits, requests, findings, and advisories are fictional. ADV-009 is not a real CVE. `Verified` always applies only to its stated synthetic evidence scope. A detected event, accepted action, verified outcome, closed case, and delivered message are separate concepts. WhatsApp requires official business setup before live use.

The UI is English. Indonesian localization, billing/pricing, advanced Ghost isolation, real provider integrations, and backend retention scheduling are intentionally deferred. Quiet hours and retention are preference previews; no live scheduler runs. Authentication credentials stay in the existing encrypted server-side local store. Real Canvas edits are held only in page memory and lost on reload/navigation; demo annotations retain browser-only storage. Demo reducer data and appearance live in React memory for the current tab.

## Architecture and extension points

- `src/app`: Next.js App Router, shared application shell, loading/error/404 states, validated route dispatch.
- `src/components/ui`: small shadcn-style primitives; Radix Dialog handles focus trapping, Escape, and focus restoration.
- `src/components/views`: coherent product views with shared links and IDs.
- `src/data/demo`: central fictional components, relationships, findings, and deterministic defaults.
- `src/domain/types.ts`: typed domain records and actions.
- `src/domain/demo.ts`: pure incident state machine, trigger rules, deduplication, rollback, archive, and reset.
- `src/components/demo-provider.tsx`: tab-local React state and theme provider.
- `src/services/adapters.ts`: repository and scan demo implementations, plus contracts/sample adapters for application maps, telemetry, response enforcement, notifications, and optional AI. Repository onboarding and simulated scan jobs consume their demo adapters; the incident reducer owns the local event replay.

To introduce real services, implement server-side adapters and authenticated API boundaries, then replace fixture dispatch with evidence-backed server events. Response verification must remain separate from enforcement acceptance. Use an outbox with attempted/provider/delivery timestamps and status callbacks; `HTTP 200` alone is not recipient delivery. Keep provider keys on the server. The optional `AIProvider` has no selected vendor or model and throws while unconfigured; it must never decide enforcement or manufacture verification evidence.

The implementation follows the repository blueprint and the read-only [approved WetScan document](https://docs.google.com/document/d/1fYMWvxEhbuOlc4aAn8oEgVwX84RHmeD3jjyiw_TiO_E/edit). Reference folder and subfolder metadata were accessible; source screenshot pixels were not used as verified visual evidence. Design decisions and validation artifacts are under `docs/` and `evidence/`.

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
# With npm start running in another terminal:
npm run test:e2e
npm audit
```

Unit tests defend truthful transitions, notification preferences/deduplication, decoy setup, draft rules, closure/rollback, and reset. Playwright covers the complete primary journey, unsuccessful/pending verification, onboarding, declared routes, staging validation, Canvas lenses/list view, dialog keyboard behavior, responsive overflow, and automated WCAG A/AA checks. Screenshots and measured results are in `evidence/`; the final validation record states which checks were actually completed. Automated accessibility checks are scoped evidence, not a full accessibility certification.

Framework references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [React Flow](https://reactflow.dev/learn), [shadcn Dialog](https://ui.shadcn.com/docs/components/radix/dialog).
