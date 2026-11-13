# WetScan 2.0 — Web App Prototype Blueprint & Master AI Coding Prompt

**Version:** 1.0 · **Prepared:** 13 November 2026 · **Language:** Indonesian product brief, English implementation prompt  
**Purpose:** Build a highly polished, clickable, realistic **WEB APP PROTOTYPE** as a shared product/UX reference, before implementing production-grade security services.  
**Source of truth:** The team's current Google Doc “WetScan” and the decisions summarized here.  
**Primary principle:** **Cybersecurity made simple for everyone who builds software.**

> **Critical distinction:** This file specifies **a web prototype** with realistic, interactive demo flows. It does not imply that real scanning, active runtime protection, LLM analysis, or notifications are already operational. Display `Demo mode`, `Simulated`, `Connected`, `Verification pending`, etc. truthfully. Never invent security evidence.

---

## 1. Decisions locked for the prototype

| Area | Decision | Important boundary |
|---|---|---|
| Positioning | **“Canva-like usability for application security”** | Borrow simplicity, guided experience, and approachable language—not Canva's design editor or brand identity. |
| Product shape | **WetScan Canvas + Guard + Sentinel** | Intelligence and Ghost live **inside Sentinel**. Trust is a **Canvas lens**. Integrity tests execute **in Guard** and visualize in Canvas. |
| Code connections | **GitHub and GitLab only** | No ZIP upload, local folder upload, Bitbucket, or direct repository URL import as a supported connection. |
| DAST | Remains part of Guard | User explicitly configures/authorizes a **staging URL**; repository integration by itself does not give permission to attack a deployment. |
| Sentinel | Always-on *when a real telemetry source and worker are active* | The prototype may simulate events; live protection must not be claimed without verified infrastructure. |
| Threat intelligence | Internal incident learning + external advisory research | Candidate rules require validation/approval before being activated. |
| Ghost | **Under Sentinel** | Ghost Lite = decoy endpoint/honeytoken → event → incident; routing attackers into decoy worlds is a later capability. |
| Notifications | **Telegram, email, WhatsApp** options | On threat detection and on **verified** neutralization/mitigation outcome; distinguish channel delivery success from successful protection. |
| LLM | Optional, **provider-agnostic** | No hardcoded exclusive vendor or model; owner chooses after comparing cost, latency, quality, and privacy. |
| Monetization | Free, Builder, Studio/Agency, one-time Launch Security Check; metered credits later | Do **not** include embedded-security revenue, human expert marketplace, elaborate reseller marketplace, or enterprise custom deals as near-term roadmap. |
| Delivery team | **2 developers: Wildhan and Daud** | Focused development sprint Friday evening, **13 Nov**, through Sunday evening, **15 Nov 2026 (WIB)**. Prioritize a demonstrably working vertical slice over inflated breadth. |

### Definition of "friendly"

A first-time user should be able to answer within seconds:

1. **What is my app made of?** → Canvas.
2. **What is potentially unsafe?** → Guard findings and risk explanation.
3. **What is happening right now?** → Sentinel.
4. **What should I do next?** → A single recommended action with details on demand.

Use familiar phrasing with expandable technical details:

- “Potentially unsafe access” first, `BOLA / IDOR` on expand.
- “A risky dependency was discovered” first, `CVE / CVSS / package range` on expand.
- “Temporary protection applied” first, gateway/rule details on expand.
- “Not verified” is a valid status. Avoid magical green 100% scores.

---

## 2. Design reference analysis

User-provided reference folder: [WetScan Visual References — Google Drive](https://drive.google.com/drive/folders/1cMuCm6xAwO37azU1b0gtTnHzG198af7r?usp=sharing).

The folder contains **Aikido** and **Snyk** subfolders, including screenshot images and screenshot PDFs of real product UIs. Specific visible patterns in inspected images:

**Aikido screenshots**
- Full-height, dark/navy sidebar separating Dashboard, Feed, AutoFix, repository assets, and protection tools.
- Main content on light neutral canvas, issue summary grouped by severity, quick status summaries, small actionable “get started” tasks.
- Risk list table with severity badges, filtering, status grouping (ignored/solved), and explanations.
- Useful inspiration: strong operational overview, clear status hierarchy, actionable onboarding—not identical navigation or visual branding.

**Snyk screenshots**
- Clean, spacious, light enterprise UI, tightly organized page structure.
- A clear first-time integration wizard: **choose integration method → set permissions → configure automation**.
- Project landing with specific, readable next steps instead of overwhelming a newcomer with telemetry.
- Useful inspiration: simple integration steps, progressive disclosure, trust-building permission explanations.

**WetScan's purposeful difference:** The **Canvas** is the spatial home of the app. Guard/Sentinel findings are linked **to the app's actual components and workflows**, not merely collected into independent scanner dashboards. The interface should feel *friendly and delightful, but technically honest*. Do not copy competitor assets, logos, illustrations, exact layouts, or colors.

Visual inspiration for Canvas interaction: n8n's pan/zoom/node-edge canvas, adapted to application architecture visualization (not automation building and not an AI app builder).

---

## 3. Primary users and demo narrative

### Persona A — first-time builder

> “I made an app with AI and Next.js. I know it works, but I don't know what's protecting user data.”

Entry → Sign in / Demo → Connect GitHub/GitLab → Select repo → See visual components → Click potentially risky API → Understand evidence → See one recommended next step.

### Persona B — freelancer / small agency lead

> “I maintain multiple client apps and need a clear security status, ongoing alerts, and shareable evidence.”

Entry → Workspace overview → Select client project → Last release / risk → Review open incident → Check protection action and notifications → View scan evidence / release report.

### Recommended **single live walkthrough** (90–120 seconds)

1. Open **Workspace** on a prepared **Demo project** `Orderly Demo`, explicitly labeled `Demo data`.
2. Open **Canvas**, see Next.js frontend → API → Clerk/Auth → PostgreSQL/Orders database; GitHub repository and hosting are separate supporting nodes.
3. Click `Orders API`; inspector shows **Potential access-control issue**, file/endpoint and linked Guard finding. Click `View evidence`.
4. Open **Guard**, inspect a scoped test showing **Customer A accessing Customer B's order** (synthetic data, authorized test). Show `Suggested fix` and `Retest` **only as a clearly simulated flow** unless an actual runner exists.
5. Open **Sentinel → Live Activity**; click `Simulate suspicious activity` **in Demo mode only**. Show timeline: Detected → Policy evaluated → Mitigation applied → Outcome verification → Notification status.
6. Display paired notifications: `Threat detected` and `Neutralization verified` **only if demo scenario contains explicit verification event**; include per-channel statuses for Telegram / Email / WhatsApp.
7. Open **Intelligence** within Sentinel: new incident pattern archived, candidate rule awaiting review, external advisory mapped to a dependency, **not** labeled “actively exploited here” by default.

A demo should have **a beginning, visible cause-and-effect, and a truthful ending**.

---

## 4. Information architecture / sitemap

**Navigation must be comfortable for beginners:** grouped, collapsible, with project context and a clear primary call to action. Use no more than three major top-level sections. Suggested:

```text
WetScan
Workspace selector                        [Northstar Studio ▼]
Project selector                          [Orderly Demo ▼]

HOME
  Overview
  Projects
  Activity

PROTECT MY APP
  Canvas                    ★ core differentiator
  Guard
    Overview
    Scans
    Findings
    Logic & Workflow Security (Integrity)
    AI Remediation
    Release Policies
    Release History
  Sentinel
    Overview
    Live Activity
    Alerts & Incidents
    Responses
    Ghost
    Intelligence
      Threat Knowledge
      Advisory Explorer
      Exposures

MANAGE
  Notifications             (channel setup + delivery history)
  Integrations              (code: GitHub/GitLab ONLY; staging URL as configuration)
  Reports
  Team & Settings

Bottom: Help • Docs • Demo mode indicator • Profile
```

**Navigation interpretation:** `Ghost` and `Intelligence` are children of Sentinel. `Trust` appears as a toggle/lens within Canvas. `Integrity` appears as both a **Canvas workflow overlay** and a **Guard testing capability**, without pretending they are two execution engines.

### Prototype routes (Next.js App Router)

```text
/                         welcoming marketing / product preview
/demo                     enter sample workspace
/onboarding                guided GitHub/GitLab connector wizard
/app                       workspace overview
/app/projects              project directory
/app/projects/[projectId]  project hub
/app/projects/[projectId]/canvas
/app/projects/[projectId]/guard
/app/projects/[projectId]/guard/scans
/app/projects/[projectId]/guard/findings
/app/projects/[projectId]/guard/findings/[findingId]
/app/projects/[projectId]/guard/integrity
/app/projects/[projectId]/guard/remediation
/app/projects/[projectId]/guard/releases
/app/projects/[projectId]/sentinel
/app/projects/[projectId]/sentinel/activity
/app/projects/[projectId]/sentinel/incidents
/app/projects/[projectId]/sentinel/incidents/[incidentId]
/app/projects/[projectId]/sentinel/ghost
/app/projects/[projectId]/sentinel/intelligence
/app/notifications
/app/integrations
/app/reports
/app/settings
/pricing                  optional, secondary to prototype app
```

If route breadth is too large for the sprint, combine adjacent views using tabs **without removing the user journeys**. No route should render a generic unfinished page.

---

## 5. Screen-by-screen design specification

### 5.1 Landing & First-run

**Hero:** “Your app is growing. Let's keep it safe.”  
**Support:** “See how your app works, discover risks, and monitor threats—all in one friendly security workspace.”

Primary CTA: `Explore live demo`. Secondary: `Connect your repository`.

Below hero: a **mini interactive architecture diagram** with one API highlighted, followed by the three capabilities **Understand (Canvas)** / **Check (Guard)** / **Stay protected (Sentinel)**. Avoid aggressive fear marketing, skull imagery, Matrix green, generic cyber stock art, or sweeping “100% secure” promises.

**Onboarding wizard**
1. **Choose source:** GitHub or GitLab large cards (nothing else).
2. **Access confirmation:** explain read-only repo permissions; link to permission details; “Connect provider” button. If running as prototype, selecting a provider opens `Demo connection only` confirmation, not a fake OAuth success.
3. **Choose repository:** list **synthetic sample repositories** in Demo mode, clearly marked. Real implementation uses actual granted repository list.
4. **Set your project:** name, main branch, optional authorized staging URL, optional framework detection.
5. **You're ready:** landing into Canvas with guided first action.

No credit-card gate. A clear `Skip and explore demo` path.

### 5.2 Workspace Overview

Top section: one calming headline with operational summary: **“Good morning. Here's what needs attention.”**

- Project switcher, active protection coverage, next recommended action.
- Three principal status surfaces, not 12 KPI cards: `Apps monitored`, `Findings needing review`, `Open incidents`.
- Main **“Needs your attention”** list prioritized by severity *and verifiability*.
- **App health preview** mini graph; clicking opens Canvas.
- **Recent activity timeline**: new scan, rule match, mitigation applied, advisory discovered.
- Empty state: “Connect your first code repository” with clear CTA.

Never imply an application is protected simply because it exists in the project list. A project can show `Repo connected`, `Scanner active`, `Runtime data not connected`, `Response enforcement unavailable` as separate coverage statuses.

### 5.3 Project Hub

Simple project identity strip: name, stack, repo provider, commit short SHA, `Demo` / `Production` / `Staging`, last scan.

Action cards:
- `Explore application map` → Canvas.
- `Run security checks` → Guard (real only when engine available; otherwise demo simulation explicitly).
- `Inspect live protection` → Sentinel (show coverage status).

Right area: `What WetScan knows` vs `Not yet verified`.

### 5.4 **Canvas — the flagship experience**

**Full-viewport three-column composition:**

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Project > Canvas    [Architecture | Security | Trust | Workflows]   │
│                 [Staging ▼] [Verified only □] [Fit graph] [Help]    │
├────────────────┬─────────────────────────────────────┬──────────────┤
│ Component      │                                     │ Inspector    │
│ explorer       │  interactive React Flow canvas     │              │
│                │                                     │ Name         │
│ Frontend       │ [Web UI] ──→ [API] ──→ [Database]   │ Role         │
│ Authentication │               ↑                     │ Source       │
│ APIs           │             [Auth]                  │ Trust status │
│ Databases      │                                     │ Issues       │
│ Integrations   │ [GitHub] → [Release] → [Hosting]     │ Evidence     │
│ Data stores    │                                     │ [Inspect]    │
├────────────────┴─────────────────────────────────────┴──────────────┤
│ Legend: verified / inferred / manually added; risk overlay; zoom    │
└─────────────────────────────────────────────────────────────────────┘
```

**Canvas node types:** Frontend, API, Auth/Identity, Database, Cache, Storage, External API, Repository (GitHub/GitLab), CI/Release, Hosting, Background Worker, Observability/Telemetry. Use neutral icon shape differences, minimal color, readable labels. Each node has semantic `component type`, `environment`, `source confidence`, `linked findings`, `events`, `owner` (if known).

**Edges represent actual architectural relationships when known:** request, auth check, data read/write, webhook, deployment, telemetry. Show direction and labels; allow unknown relationship state rather than hallucinating paths. Use one default graph with 7–9 well-laid-out nodes; avoid tangled graphs.

**Modes:**
- **Architecture:** relationships, service boundaries, service metadata; cleanest default.
- **Security:** color/outline highlights on components with Guard findings or Sentinel events; legend with clear uncertainty states.
- **Trust:** role/resource access matrix; select Customer/Staff/Admin and visually highlight permitted vs observed access, including BOLA/IDOR demonstration path.
- **Workflows:** display a state graph for Integrity (e.g. `Draft → Approved → Locked`); show expected vs observed state transition and test evidence.

**Inspector interaction:** Clicking a node opens a right-hand sidebar/drawer with plain-language summary, evidence provenance, confidence, data sensitivity, related Guard findings, Sentinel incidents, actionable CTA. Clicking an edge explains what flows across it and whether access is confirmed. Interactions are linked to route/details and filter. Keyboard navigation and a fallback list view are required.

**Onboarding teachable moment:** a small nonmodal tooltip: “This line means your API reads from this database. Click any node to see what WetScan knows.”

**Key rule:** source confidence must be `VERIFIED`, `INFERRED`, or `USER_ADDED`—never present AI assumptions as verified. No claim of automatic universal app architecture discovery.

### 5.5 Guard Overview + Scans + Findings

Guard is **a quality control inspector** for the app before/during release.

**Guard Overview:** `Latest scan`, `Security checks`, `Findings to fix`, `Release decision`, `What was checked`.

Checks section (show **availability status**):
- SAST
- Dependency / SCA (including npm/OSV)
- Secret scanning
- IaC & configuration checks
- Container/SBOM (supported later if worker exists)
- DAST staging (only authorized URL)
- API security tests
- Logic & Workflow Security (**Integrity**)
- AI remediation (optional, LLM selected/configured)
- Release policies / gating

**Scans page:** timeline of runs with commit, branch, scope, duration, status; `New scan` setup should show which engines will run, projected resource use, staging warning, and no unauthorized endpoint. Prototype button `Simulate scan (demo)`—it only updates sample run state and shows fixtures; no fake real scan.

**Findings:** filters by severity, project, verification, affected component, source engine; table rows with understandable title and exact technical type on secondary line. Group by underlying vulnerability when evidence supports deduplication, not by arbitrary similarity.

**Finding Detail:**
- Plain explanation / “Why it matters”.
- Evidence: file path, code excerpt, request/response (redacted), detection engine, version, scope, timestamp.
- Status `Detected`, `Potential`, `Verified`, `Fixed awaiting retest`, `Verified fixed`, `False positive`.
- `View on Canvas` highlights relevant node/edge.
- `Suggested fix` can show a **prewritten demo suggestion**; label it `Example remediation`; no fabricated PR creation.
- `Retest` simulated only if no runner; if real, show actual job status.

**DAST configuration panel:** staging URL, ownership/authorization checkbox, allowed paths, method/rate limits, optional test accounts; placeholder warnings for out-of-scope production.

**Release policy:** default `High/Critical block (if policy configured and checks are verified)`, `Medium warn`, `Low informational`. Distinguish `No scan performed` from `Pass`. No claim of blocking real provider deployments until enforcement integration is proven.

### 5.6 Integrity (Guard runner / Canvas workflows)

- Page: `Logic & Workflow Security` with a welcoming explanation: “Check that important actions follow the rules you intended.”
- Templates: access-control, workflow step bypass, illegal state transition, replay/idempotency, unauthorized data modification.
- Each template explains the expected invariant before testing. Developers can edit/confirm it; AI proposals are optional and nonauthoritative.
- Demo workflow: `Grade/Draft → Approved → Locked` where API accepts forbidden edit after locked state; user sees one failed invariant, a proposed patch description, then simulated or real retest.
- Output: `Expected → Observed → Evidence → What to fix`. Never process real payments or private production data.

### 5.7 Sentinel Overview & Live Activity

Analogy: **Sentinel is an always-on police patrol** when telemetry and enforcement are actually connected.

**Sentinel Overview:** one statement `Protection status`, breakdown of telemetry ingestion, detection rules, response adapters, incident count, open investigations, next actionable item.

**Live Activity:** filterable timeline of security events with source, endpoint, type, risk, outcome. A live-simulated stream in Demo mode is fine, but label it prominently. Include pauses, filter controls, and a clear `Simulate suspicious request` control—*not* a real offensive testing tool.

**Detection rule library:** grouped cards—repeated unauthorized access, suspicious path probing, authentication failures, decoy access; status Active / Draft / Review. Descriptions are human-friendly with technical YAML/JSON hidden under `Advanced`.

**Incident detail:** important state timeline:

```text
[14:32:10] Suspicious activity detected
[14:32:11] Incident created / notification queued
[14:32:12] Rule matched / response policy approved
[14:32:13] Temporary restriction applied (mitigation applied)
[14:32:15] Follow-up verification completed (neutralization verified)
[14:32:16] Outcome notification delivered to enabled channels
```

**Do not conflate these:**
- `attack_detected`: observed suspicious action meeting a detector rule; not necessarily a confirmed intruder.
- `mitigation_applied`: an enforcement adapter accepted the action.
- `mitigation_failed` or `verification_pending`: an action may have failed or its effectiveness not proven.
- `neutralization_verified`: an explicit check proved the relevant malicious action was prevented **within the defined test scope**.
- `incident_closed`: a separate user/policy lifecycle decision, not automatic proof of security.

Response control: action summary, reason, scope, TTL, policy, rollback button, delivery logs, and manual approval for high-impact actions. On a demo project, use `local demo rate limit` simulated/isolated; do not modify real IP blocks or firewall rules.

### 5.8 **Ghost** (under Sentinel)

Ghost is not a separate product in navigation. Overview page describes deception: “Set up safe decoys to make suspicious exploration easier to spot.”

**Ghost Lite** prototype card with an illustrative decoy endpoint `/_internal/decoy` or `/.well-known/demo-decoy` in a synthetic demo app; a test interaction generates a **simulated event**. Include explanation that some legitimate scanners may trigger traps and that a trap hit is not proof of compromise.

- `Ghost status`: Off / Demo enabled / Configured.
- `Deploy decoy` in prototype should open a simulated setup wizard, not silently create a production route.
- `Test decoy` → Sentinel incident plus Intelligence archive record.
- Ghost Adaptive / Isolation displayed in `Roadmap`/disabled with honest label, not functional controls.

### 5.9 **Intelligence** (under Sentinel)

Analogy: **Intelligence is Sentinel's detective and memory**.

**Two tabs** in one coherent area:

- **Internal Intelligence / Case Library:** archive normalized incidents, cluster patterns, explain links to detections, propose new detection rules; `Review candidate rule` does not activate rule silently. Show `Source incidents` and validation status. Sample: three related decoy/path-probing events lead to a draft candidate rule.
- **External Intelligence / Advisories:** CISA KEV, NVD, GitHub Advisory Database, OSV; advisory cards and a mapping table `advisory → package version → project/deployment → exposure confidence`. A new advisory is **not** an observed attack.

`Re-evaluate exposure` sample action in Demo mode updates one synthetic finding with provenance and timestamp. For actual later integration, use scheduled feeds and local dependency inventory.

### 5.10 Notifications Center (critical change)

Users configure **Telegram, Email, WhatsApp** individually; channel toggles and status are explicit:

| Channel | Prototype experience | Real implementation option |
|---|---|---|
| Telegram | Select `Configured in demo`, test preview, opt-in toggles | Telegram Bot API `sendMessage`, with secure bot token and chat ID |
| Email | Email address input + safe demo preview | SMTP or transactional email API; store redacted delivery logs |
| WhatsApp | User-consented number + `Requires business setup` status or demo preview | Official WhatsApp Business Platform / Cloud API only, with opt-in, approved templates when required, provider pricing and status callbacks |

**User-selectable triggers:** Threat detected, Action applied, Neutralization verified, Action failed, High-priority exposure, Daily digest (optional). Defaults: Threat detected + Outcome changes (not all raw events). Include quiet hours, retry limits, deduplication per incident, and suppression to avoid spam.

**Two notification templates:**

```text
[WetScan] Suspicious activity detected
Project: Orderly Demo
Event: Repeated unauthorized API access
Status: Investigating
Action: Temporary protection being evaluated
View incident: /app/projects/orderly-demo/sentinel/incidents/INC-1042
```

```text
[WetScan] Protection outcome update
Project: Orderly Demo
Incident: INC-1042
Action: Temporary rate limit applied (10 min)
Verification: Confirmed blocked in the scoped demo check
Status: Neutralization verified (scope-limited)
View evidence: /app/projects/orderly-demo/sentinel/incidents/INC-1042
```

**Implementation contract:** `provider_message_id`, `queued_at`, `attempted_at`, `delivered_at` when confirmed, `failed_at`, `last_error`, `channel`, `incident_id`, `trigger_type`. `HTTP 200 from provider` does not necessarily imply delivery to the user. Demo status `Simulated preview` must not say `Delivered`.

### 5.11 Integrations + Settings + Reports

**Integrations** has separate sections:
- `Source Code` → GitHub and GitLab **only** (with required scopes shown).
- `Staging test target` → authorized URL configuration. This is a test **target**, not an extra source-code provider.
- `Runtime telemetry` → synthetic demo adapter; production telemetry connectors later.
- `Notifications` → Telegram, Email, WhatsApp. These are **communication channels**, not Guard code-source integrations.
- `AI configuration` → provider-agnostic interface only, `Not configured` default.

**Reports:** user-friendly, one-page security review with verified findings, incomplete checks, risks remaining, incident/response timeline, and clear “not a pentest certification” notice. Print-friendly. Allow `Copy summary`; PDF export optional if properly implemented.

**Settings:** light/dark appearance, language (start Indonesian with clear English technical terms), team, privacy retention, notifications, project scope. No real billing checkout in prototype. Pricing is informational only.

---

## 6. Visual identity / design system

### Art direction

**Friendly professional SaaS, not an intimidating SOC interface.** Think: Notion/Linear clarity + Canva-style approachability + n8n's meaningful graph interaction, while retaining WetScan's own visual identity. Design to support beginners without hiding advanced details from security engineers.

- Primary palette: sophisticated **blue / indigo**, balanced with cool neutral backgrounds.
- Prefer **light theme as default**; dark theme carefully designed, not black-and-neon.
- Typography: `Inter` or `Geist` (fallback system sans). Modest hierarchy, 14–16 px body, 24–30 px page titles.
- 8px spacing grid, 12–16px border radius for cards, narrow shadows and subtle borders.
- Use icons like `lucide-react`, consistent 18–20px, not emoji used as persistent icons.
- Progressive disclosure: 1 recommended action first, technical detail second.
- Navigation density lower than Aikido's full enterprise sidebar, while still retaining important pages.

#### Suggested starter tokens (adjust for accessibility)

```css
:root {
  --background: #f7f9fd;
  --surface: #ffffff;
  --surface-muted: #f1f5fb;
  --ink: #18243b;
  --ink-muted: #68788f;
  --primary: #4167e9;
  --primary-hover: #3558cc;
  --border: #e2e8f2;
  --good: #168460;
  --warning: #b86d14;
  --critical: #c63d44;
  --focus: #4775ff;
}
/* In dark mode, map same semantic tokens to accessible dark surfaces.
   Do not use severity color as the only communication channel. */
```

**Information design rules:**
- Never show a random “Security score 98/100” without documented formula and coverage.
- Separate source/configuration states from actual verified security states.
- Critical uses icon + label + color, never red-only indicator.
- High trust cues: timestamps, source, commit, evidence, confidence, authorization scope.
- No huge walls of text in the interface; drawers and accordions for deep technical details.
- Desktop target: **1440×900**. Must adapt gracefully to **1280px** and mobile; Canvas gets a structured component-list alternative when screen too narrow.
- Keyboard focus states, contrast, semantic buttons, drawers accessible via Escape, loading/empty/error cases, reduced-motion support.

### Delight without fake intelligence

- Smooth node focus and edge highlighting.
- Gentle skeleton while scanning **only in explicitly labeled demo simulation**.
- Useful empty states: illustrated mini-graph or clean icon, not stock-photo filler.
- Guided setup checklist with progress `Connect repo`, `Review first scan`, `Configure staging`, `Set notifications`.
- Consistent notifications (“Saved”, “Demo simulation completed”) rather than silent actions.

---

## 7. Prototype technical approach (cheap & maintainable)

### Recommended for the **web prototype**

| Need | Pick | Why |
|---|---|---|
| Framework | Next.js App Router + TypeScript | One codebase, familiar developer environment |
| Styling | Tailwind CSS + shadcn/ui primitives | Accessible UI components and rapid coherent styling |
| Graph | `@xyflow/react` (React Flow) | Pan/zoom, nodes, edges, inspector, interaction |
| Icons | `lucide-react` | Consistent lightweight iconography |
| Charts | Recharts (only where clarity improves) | Risk trend + activity chart; avoid decorative analytics |
| Client state | React hooks/context, or Zustand only if necessary | Avoid excessive architecture for a prototype |
| Data | Typed fixture files + local client state | Deterministic and easy to demo; no paid backend |
| Persistence | Optional `localStorage` for UI preferences, only nonsensitive demo data | No credentials or fake PII stored |
| Notifications | Sonner or a simple accessible toast system | Visible action feedback |
| Tests | Vitest + React Testing Library, Playwright smoke flow if feasible | Defends against non-functional demo interactions |

**Do not introduce** Redis, Kafka, service mesh, full Kubernetes, vector database, production OAuth, payment processor, or mandatory LLM dependency just to show the prototype.

### Engineering direction for later **real services** (NOT necessary to render prototype)

- GitHub App with repo-scoped **read-only** permissions by default; GitLab OAuth/Project Access Token integration with least privilege, secret storage, and explicit permissions.
- Scan worker in isolated container using existing tools: Semgrep/Opengrep, OSV-Scanner/npm audit, Gitleaks, Trivy if appropriate; make license/usage and permissions checks before inclusion.
- OWASP ZAP Automation Framework for authorized staging DAST; configure scope, rate/time limits, dummy accounts. ZAP is not merely a status card.
- PostgreSQL for projects, findings, cases, and notification outbox; queue/worker only once real asynchronous jobs are implemented.
- Sentinel: telemetry ingestion → normalized event store → deterministic rules → response adapter → evidence → incident timeline → knowledge enrichment.
- Telegram Bot API and SMTP email adapters can be exercised early. WhatsApp requires a verified/approved setup on the official business platform; do not use unauthorized personal account automation.
- Secure redaction, scoped secrets, permission boundaries, event deduplication, retry/backoff, audit, and TTL rollback are requirements before production-grade claims.

### LLM options — **owner must choose**; no lock-in

An LLM is **optional for this prototype**. The clickable design, inspection views, and scripted demo scenario work without a paid LLM API.

| Option | Suitable when | Tradeoff | Recommendation |
|---|---|---|---|
| **Vercel AI SDK, direct provider adapters** | TypeScript/Next.js stack, model switching per request | Requires integrating selected providers; abstraction stays within app | **Best simple default** for future WetScan AI explanation/remediation |
| **LiteLLM gateway** | Central multi-provider routing, unified OpenAI-compatible endpoint, budget/telemetry controls | Extra gateway process/deployment & operational work | **Best if multiple services/LLMs** require one routing layer |
| **LangChain / LangGraph** | Complex multistep reasoning, tool execution, human approval graphs | More moving parts and complexity than needed for a prototype | Add only when investigation workflows are genuinely complex |

**Selection must be explicit:** keep `AI_ENABLED=false` by default, interface `AIProvider`, env-driven `provider` + `model` + `baseURL` (where appropriate), and an easy switch between providers. Do not hardcode an OpenAI/Anthropic/Gemini-only client into domain logic. Let owner choose model after reviewing cost, output quality, rate limits, regional privacy controls, and availability. Never have a model unilaterally decide enforcement or verification results.

Useful verified documentation:
- AI SDK: https://vercel.com/ai-sdk
- LiteLLM: https://docs.litellm.ai/docs/
- LangChain JavaScript: https://js.langchain.com/docs/
- React Flow: https://reactflow.dev/
- OWASP ZAP Automation Framework: https://www.zaproxy.org/docs/automate/automation-framework/
- Telegram Bot API: https://core.telegram.org/bots/api
- GitHub App permissions: https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app

---

## 8. Typed demo contract / fixture data

Use a **small number of deterministic, fully fictional records** and cross-link their IDs across pages. No real client data, real customer PII, active credentials, or real attack traffic.

### Example demo workspace

- `workspaceId`: `northstar-studio`
- `projectId`: `orderly-demo`
- `repository`: `northstar-studio/orderly-demo`
- `sourceProvider`: `github` (**DEMO CONNECTION**, not actually authorized)
- `branch`: `main`
- `commit`: `a1b2c3d` (synthetic)
- `environment`: `staging`
- `framework`: `Next.js`
- Services: `Next.js UI`, `Orders API`, `Clerk Auth`, `PostgreSQL`, `GitHub`, `Release`, `Hosting`, `Telemetry Collector`.

### Minimal TypeScript types

```ts
type EvidenceOrigin = 'verified' | 'inferred' | 'user_added';
type DataMode = 'demo' | 'live';
type ConnectionState = 'not_configured' | 'demo_connected' | 'connected' | 'error';
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'simulated';
type ResponseState = 'none' | 'evaluating' | 'applied' | 'failed' | 'verification_pending' | 'neutralization_verified';
type NotificationDelivery = 'preview' | 'queued' | 'sent' | 'delivered' | 'failed';
type NotificationChannel = 'telegram' | 'email' | 'whatsapp';

interface AppNode {
  id: string;
  label: string;
  kind: 'frontend' | 'api' | 'auth' | 'database' | 'repository' | 'release' | 'hosting' | 'telemetry' | 'external';
  environment: 'staging' | 'production' | 'development';
  evidenceOrigin: EvidenceOrigin;
  risk: Severity | 'none' | 'not_assessed';
  findingIds: string[];
  incidentIds: string[];
}
interface AppEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  evidenceOrigin: EvidenceOrigin;
}
interface Finding {
  id: string;
  projectId: string;
  title: string;
  category: string;
  severity: Severity;
  evidenceOrigin: EvidenceOrigin;
  nodeIds: string[];
  status: 'potential' | 'verified' | 'fixed_pending_retest' | 'verified_fixed' | 'false_positive';
  plainLanguageImpact: string;
  evidence: string[];
}
interface Incident {
  id: string;
  projectId: string;
  title: string;
  severity: Severity;
  status: 'open' | 'investigating' | 'mitigated' | 'closed';
  responseState: ResponseState;
  timeline: Array<{ id: string; timestamp: string; type: string; explanation: string; evidenceId?: string }>;
  relatedNodeIds: string[];
}
interface ChannelConfig {
  channel: NotificationChannel;
  enabled: boolean;
  state: ConnectionState;
  triggers: Array<'attack_detected' | 'mitigation_applied' | 'neutralization_verified' | 'response_failed' | 'new_exposure'>;
}
interface DeliveryLog {
  id: string;
  incidentId: string;
  channel: NotificationChannel;
  trigger: string;
  status: NotificationDelivery;
  sentAt?: string;
  deliveredAt?: string;
  isSimulated: boolean;
}
```

### Reusable fixtures

- `FIND-102`: suspected broken object-level authorization on `GET /api/orders/:id`, linked to `Orders API`. Demo test turns `verified` only after synthetic runner result is displayed as such.
- `INC-1042`: repeated unauthorized access triggers rule, then a scoped protection action; timeline carries a distinct `neutralization_verified` event.
- `GHOST-03`: decoy hit triggers event `ghost.decoy_triggered`, linked to `INC-1042` or a separate test incident.
- `ADV-009`: external advisory potentially matches a dependency, **separate from active attack**.
- `RULE-CAND-02`: Intelligence proposes a rule, status `needs_review`.

**State transitions are not random.** Buttons update these typed fixtures predictably in local state. `Reset demo` reliably returns the initial scenario.

---

## 9. Sprint plan for two developers: Friday night → Sunday night

This is a **sequencing plan**, not a promise that all production security capabilities can be created in a single weekend. Define responsibilities by file/path and shared contracts to minimize coding-agent collisions.

| Window (WIB) | Wildhan — Product / Frontend / AI architecture | Daud — Backend contracts / Test flows | Checkpoint |
|---|---|---|---|
| Friday night | Initialize Next.js app, design tokens, layouts, onboarding UX, route skeleton | Define typed domain fixtures, route contracts, status enums, demo event and response model | Demo can navigate from landing → app → project |
| Saturday early | Build Canvas with React Flow, node inspector, modes; findings views | Build deterministic incident timeline, mock scan runner interface, notification outbox fixture | Canvas node → linked finding works |
| Saturday later | Build Guard detail/Integrity interaction, release status UX | Build Sentinel demo event pipeline and simulated response/verification transitions; notification adapter contracts | Threat scenario reliably generates timeline |
| Saturday evening | Sentinel UI, Intelligence/Ghost view, channel configuration | GitHub/GitLab connector interface/prototype flow and optionally **one real** GitHub/GitLab connection if credentials available | User can finish one full walkthrough |
| Sunday morning | UX polish, labels, empty/error states, mobile fallback, accessibility | Smoke tests, scenario reset, evidence links, Telegram/email live test only if safe credentials exist | No broken CTA; status labels honest |
| Sunday afternoon | Demo script, screenshots, onboarding instruction, concise README | End-to-end verification, stubs vs real audit, fallback when provider offline | Demo passes checklist |
| Sunday evening | Final QA + rehearsed walkthrough + freeze | Final integration + rollback + branch merge | Stable demo; deferred items documented |

**Shared repo conventions:** single owner per route/module, stable TypeScript contracts, no overlapping edits to `package.json` without coordination, small PRs, `main` protected, one integration window, feature flags for demo-only and provider integrations.

**Minimum valuable outcome:** A polished **interactive web prototype** + one honest, reproducible vertical slice. If more must be cut, prioritize Canvas, Guard finding details, Sentinel incident/response timeline, and notifications center. Cut elaborate charts, pricing checkout, or unaudited AI auto-fixes first.

---

## 10. Prototype acceptance checklist

- [ ] Landing explains WetScan to a non-security developer in under ~15 seconds.
- [ ] User can enter Demo mode without credentials or billing.
- [ ] GitHub and GitLab are the **only code-source connector choices**.
- [ ] No ZIP/local upload control exists.
- [ ] Onboarding visibly distinguishes demo connection from real OAuth authorization.
- [ ] Workspace and project navigation are functional.
- [ ] Canvas is interactive: pan, zoom, select nodes and edges, inspect.
- [ ] Canvas supports Architecture, Security, Trust, and Workflows modes.
- [ ] Canvas has verified/inferred/user-added provenance legend.
- [ ] Canvas → Guard finding link works with exact shared IDs.
- [ ] Guard shows real-looking findings with scoped evidence and honest source status.
- [ ] DAST staging panel includes explicit authorization and scope warning.
- [ ] Integrity demonstrates a general non-financial workflow security invariant.
- [ ] Sentinel has an interactive **simulation**, explicitly labeled Demo.
- [ ] Incident timeline separates detection, action attempted/applied, and **outcome verified**.
- [ ] Notifications settings show **Telegram, Email, WhatsApp**, per-channel status, and triggers.
- [ ] A detected attack creates the first notification preview; a verified outcome creates a separate follow-up preview.
- [ ] WhatsApp is not falsely labeled live without official provider configuration.
- [ ] Ghost is nested under Sentinel and can trigger a demo incident.
- [ ] Intelligence is nested under Sentinel; internal and external sources are distinguishable.
- [ ] Proposed detection rule does **not** silently become active.
- [ ] AI interface is optional/disabled unless owner configures provider; no secrets exposed in client bundles.
- [ ] Buttons, filters, tabs, drawers, links and checkboxes behave; no dead “magic” controls.
- [ ] Demo resets to deterministic initial state; errors/empty states are handled.
- [ ] Mobile viewport has a usable fallback, particularly for Canvas.
- [ ] No fake “production protected”, “user notified”, or “neutralized” claims.
- [ ] `npm run build` and lint/typecheck/test scripts pass, or any environment blockers are explicitly documented.

---

# 11. MASTER AI CODING PROMPT — COPY/PASTE THE SECTION BELOW

> **Usage:** Paste this prompt into Codex, Claude Code, or another coding agent in a fresh repository. Attach this entire Markdown file if possible; if the agent cannot access external links, the instructions below must still be sufficient. **First milestone is a realistic, interactive prototype**, not a deceptive mock of completed enterprise security functionality.

```text
You are the principal product designer, UX architect, accessibility reviewer,
and senior full-stack TypeScript engineer for WetScan 2.0.

MISSION
Implement a beautiful, polished, highly interactive WEB APPLICATION PROTOTYPE
for WetScan, a developer-friendly application security workspace.
The product vision is “Cybersecurity made simple for everyone who builds software.”
Use the simplicity, onboarding clarity, and progressive disclosure associated
with Canva, combined with n8n-like application component visualizations,
WITHOUT copying Canva, n8n, Aikido, or Snyk assets/branding or cloning their UIs.

READ FIRST
Read the attached file WetScan_2.0_Prototype_Blueprint_and_AI_Prompt.md
in full and follow its decisions, route structure, features, data model,
status semantics, interaction rules, design tokens, and acceptance checklist.
Also reference the approved WetScan Google Doc if connected to it:
https://docs.google.com/document/d/1fYMWvxEhbuOlc4aAn8oEgVwX84RHmeD3jjyiw_TiO_E/edit
Reference screenshots are in:
https://drive.google.com/drive/folders/1cMuCm6xAwO37azU1b0gtTnHzG198af7r
If a link is unavailable, DO NOT claim to have read it. The brief is authoritative.

NON-NEGOTIABLE PRODUCT DECISIONS
- WetScan is an app-security WORKSPACE, NOT an app-building IDE.
- Primary modules: Canvas, Guard, Sentinel.
- Intelligence and Ghost are nested UNDER Sentinel.
- Trust is a lens in Canvas; authorization tests execute in Guard.
- Integrity is under Guard (Logic & Workflow Security) and is visualized in Canvas.
- Guard connects code repositories through GitHub and GitLab ONLY.
- NO ZIP upload, local-folder upload, Bitbucket, or unsupported integrations.
- A separately authorized staging URL can be configured for DAST.
- Sentinel should visualize continuous monitoring, detection, policy-approved
  responses, evidence, and notification events, but only claim true live
  protection if actual telemetry/enforcement exists.
- A detected suspicious event and successful neutralization are NOT the same.
  Model: detected -> incident -> policy evaluation -> mitigation applied ->
  verification -> neutralization verified OR failed/pending.
- Telegram, email, and WhatsApp notification channel settings are all visible.
  Notifications should be triggered at attack detection and after the
  mitigation outcome is known. Display demo previews honestly.
- Product is NOT committed to any one LLM provider. The prototype works
  completely with AI disabled; future AI interface is adapter-driven.
- Do not include expert marketplace, embedded-security business plans,
  white-label resale marketplaces, banking-only workflows, or checkout flows.
- Only a 2-developer team is available; favor maintainability and a real
  fully integrated user journey over a giant collection of unrelated pages.

RECOMMENDED STACK
- Next.js App Router, TypeScript, Tailwind, shadcn/ui, @xyflow/react,
  lucide-react, and Recharts only where charts truly aid comprehension.
- Build meaningful responsive light and dark themes; light is default.
- Use local typed deterministic fixtures for prototype data, and a clean
  service interface to replace fixtures with real APIs later.
- No paid APIs, mandatory API keys, production auth backend, Redis,
  payment processor, or real pentesting required for FIRST PROTOTYPE.
- Prefer maintained open-source packages over reinventing graph editors,
  modals, tables, charting, icon systems, or security engines.

DESIGN PRINCIPLES
- Calm, warm, precise, visually premium and operationally trustworthy.
- Friendly to people who can build an app but are not security experts.
- Strong hierarchy, 8px spacing system, cards with subtle borders/shadows,
  crisp typography (Inter/Geist), tasteful blue/indigo emphasis.
- No cyberpunk neon, overdrawn grids, heavy gradients, generic AI slop,
  random emojis, or loud multi-colored security-dashboard decoration.
- Prefer natural language in headings; expert vocabulary available on demand.
- Clear status coverage and evidence provenance: Verified, Inferred, User-added.
- Show exact availability / Demo tags; no fake “100% secure” or invented risk score.
- Keyboard accessible controls, responsive behavior, skeletons and empty states.

THE VIEWS TO IMPLEMENT
1. Landing and guided onboarding with only GitHub/GitLab code connectors.
2. Workspace overview and project hub for “Orderly Demo”.
3. Flagship application Canvas with pan/zoom, interactive nodes and edges,
   left component explorer, right inspector; modes Architecture, Security,
   Trust, Workflows. Highlight affected API -> linked Guard finding.
4. Guard overview, scan history, findings list/details, staging DAST setup,
   remediation preview, Integrity workflow test, release status.
5. Sentinel overview, activity stream, incident list/detail, explicit
   mitigation/verification timeline, response history.
6. Ghost beneath Sentinel: safe decoy/decoy-hit demonstration.
7. Intelligence beneath Sentinel: internal incident knowledge and external
   vulnerability advisory mapping / re-evaluation; draft rules need approval.
8. Notifications center with Telegram/email/WhatsApp channels, per-trigger
   preferences, test preview, delivery logs and confirmation semantics.
9. Integrations, Reports, Settings with functional basic interactions.
10. OPTIONAL informational pricing page: Free, Builder, Studio/Agency and
    one-time Launch Security Check; no checkout implementation.

DEMO FLOW — MUST WORK
- Enter Demo mode -> workspace -> project -> Canvas.
- Select Orders API node -> inspector -> linked access-control finding.
- View finding evidence and a suggested remediation example.
- Open Sentinel -> simulate suspicious request (label as simulation).
- The demo incident timeline advances through well-defined events.
- Show first notification preview (“Threat detected”).
- Show second preview only after a synthetic verification event proves
  neutralization within scope; otherwise display pending/failed honestly.
- Ghost decoy interaction produces a traceable incident/event.
- Intelligence archives the incident and proposes a DRAFT rule requiring review.
- All routes, buttons, filters, tooltips, drawers and actions are functional.
- Add Reset Demo to restore initial state deterministically.

COMPONENT & DATA IMPLEMENTATION
- Prefer small typed components and reusable design-system primitives.
- Make project, node, finding, incident, event, mitigation, advisory,
  channel and notification IDs cross-link consistently across pages.
- Centralize fixtures in /src/data/demo or equivalent.
- Keep business logic separate from presentation.
- Use the TS types described in the attached brief where useful.
- Create adapters for repo connections, scan jobs, telemetry, response
  enforcement, notifications and optional LLM; prototype adapters can be
  DEMO IMPLEMENTATIONS and must identify themselves as such.
- For an LLM layer, define a provider-neutral interface and settings that
  display “Not configured”. Do not make any real LLM call or choose a model
  without explicit owner selection; do not place API keys in browser code.

IMPLEMENTATION ORDER
A. Scaffold, theme tokens, layout, routes, demo fixtures, reusable status UI.
B. Functional Canvas and project navigation.
C. Guard finding details + Integrity workflow visualization.
D. Sentinel state machine + incidents + notifications.
E. Intelligence, Ghost, integrations/settings.
F. Accessibility, responsive behavior, testing, visual polish.

NO FAKE FEATURES
Do not create buttons that pretend a real GitHub/GitLab OAuth succeeded.
Use “Explore demo repository” or “Demo connection” when mocking.
Do not claim real DAST/scan, WhatsApp delivery, incident response, active
production firewall rules, neural learning, auto-remediation, or verified
neutralization without underlying evidence; use visible Demo/Simulated tags.
If a capability is deferred, make its explanation helpful and its disabled
state intentional, not a broken button.

ACCEPTANCE & HANDOFF
- Confirm the full primary walkthrough runs entirely from the UI.
- Responsive at ~1440×900, 1280px desktop, and phone-width fallback.
- Test keyboard navigation, contrast, core routes, and demo reset.
- Run dependency installation, type checking, lint, and production build
  if the local environment permits; fix errors and disclose any blockers.
- Include concise README: local setup, commands, architecture, demo script,
  what is REAL vs SIMULATED, and extension points for production services.
- Provide screenshots or a working development preview if your environment
  allows it. Do not state tests or screenshots were completed if not run.

START IMPLEMENTING NOW. Do not stop at a design proposal or static mockup.
The goal is an inspectable, clickable, cohesive prototype a user can explore.
```

---

## 12. Handoff questions that remain intentionally open

These are not blockers for the **prototype**; they should be settled before production features start consuming resources:

1. **LLM provider/router:** direct multi-provider **AI SDK** (default recommendation for Next.js), self-hosted **LiteLLM** gateway, or **LangChain/LangGraph** for more complex workflows? Select later after evaluating actual use cases and costs. All are optional for prototype.
2. **LLM model(s):** owner selects after comparing output quality, unit cost, latency, tool-calling, privacy, and region. Never hardcode specific model versions from an outdated list.
3. **Actual GitHub/GitLab scopes:** which repository/org/project grants are approved? Prototype only simulates the connection.
4. **WhatsApp:** is an official WhatsApp Business Platform sender and consent/template workflow available? If not, UI supports setup and simulated preview, but does not claim live delivery.
5. **Real response adapter:** what controllable enforcement point (own demo gateway, Cloudflare API, reverse proxy, app middleware) will allow a *true* scoped neutralization test? UI prototype uses a clearly simulated incident unless proven.

**Prototype success metric:** A person unfamiliar with application security can navigate from an application diagram to an understandable finding, then to an incident and its **truthful** response outcome without having to learn an entire enterprise security stack first.
