# Canvas integration into the master prototype

## Pre-implementation audit (2026-11-14)

Fetched origin before editing. Local and remote master are `1ed845757a9601d1ff25eabb7b05d7e82180d93e`; local and remote Canvas integration are `baec634b45e2b1de7fbb31d5af9106a0ae2a4ddc`. Working tree was clean. Existing worktree `wetscan-canvas-full` was observed and left untouched. Created `integration/canvas-master-preserved` from origin/master in the existing checkout. No new clone or worktree.

### What changed in the previous integration

- `src/components/views/canvas.tsx`: the original 677-line Canvas was replaced with a re-export of the independent `CanvasPage`. The original header/lenses/explorer/graph/inspector class names survived in that page, but a fixture selector, expanded revision metadata, relationship tools, seven action buttons, and permanent filters moved the architecture workspace down and changed its hierarchy. The original role prompt and compact Orderly locked-order workflow were lost. The inspector puts editing controls before demo finding navigation. Matching colors alone did not preserve the experience.
- `app-shell.tsx`: real repository routes removed Manage, Guard/Sentinel entry points, help, and notification navigation. Account/session dialog wiring was retained. This creates contradictory navigation between demo and real maps.
- Overview and Projects each gained `RepositoryProjects`, both reading the existing dashboard account provider. They did not replace the dashboard, but the extra Overview repository directory duplicates the Projects directory.
- Demo provider, demo fixtures, and global CSS have no differences. Guard, Sentinel, finding details, auth/onboarding, account state, and original design tokens should remain untouched.
- The catch-all page added an authorized `github-<repository id>/canvas` branch. This is needed, but both source types must render the same Canvas component.

### Reusable capabilities and integration decisions

Reuse the existing Canvas controller, source adapters, source analyzer, GitHub reader, project authorization, private graph cache, revision API, layout/routing/group modules, export functions, Trust model/editor, workflow model/editor, and meaningful tests. Do not merge the previous branch wholesale. Port these feature files and the minimal route/repository-list wiring onto master. Keep the original shell structure and dashboard; use Projects for authorized repository links from the existing account provider.

Adapt the shared Canvas view around the original master header, compact lens toolbar, three-column workspace, component list, node cards, finding-first inspector, role prompt, locked-order workflow, legend, responsive behavior and theme tokens. Put source metadata, layout/export/history tools, filters and annotation controls in discoverable disclosure panels. Internal fixture selection belongs only to the test harness. Both demo and authorized repositories use this one view/controller; source/security adapters stay scoped independently.

Real maps retain Not yet scanned / Monitoring not connected. Expected Trust policies stay Not tested; workflow plans stay Not executed. No Guard/Sentinel/Intelligence backend or enforcement implementation is included.

## Final implementation

The canonical view is `src/components/views/canvas.tsx`, using the original master PageHeader, segmented lens toolbar, explorer, graph workspace, inspector, role prompt, locked-order demo and legend. `CanvasPage` was removed rather than kept as another page design. `LiveCanvas` and the demo route both render this same view with `useCanvas`; only source/authorization/persistence adapters differ. Production has no internal snapshot picker. The fixture picker exists exclusively in the isolated test host behind `?fixtures=1`.

### Preserved and refactored components

- Overview, demo provider, demo data, global CSS, Guard/Sentinel/Intelligence views, onboarding, session, account dialog/provider and middleware are unchanged from master. The only auth-library change exports the existing App JWT helper for the existing GitHub reader; it adds no OAuth flow or identity store.
- AppShell retains Workspace, Protect, Manage, nested Ghost/Intelligence, notifications, account controls, theme, help and mobile navigation. On a GitHub map, Canvas links to the current project, the mode/footer identify source observations, and Guard/Sentinel links are explicitly tagged DEMO. Those links continue to open the original Orderly scenarios, never real repository scan results.
- Projects keeps the original Orderly card and adds selected GitHub repositories in the existing project-card language, consuming `useDashboardAccountView` exclusively. Overview remains byte-identical to master. Empty selections keep the original Connect repository action rather than inserting another dashboard/directory.
- Inspector is extracted into the existing feature component, restores node-specific icons and puts finding/incident navigation before optional evidence/editing controls. Source locations and pinned revision remain available on real maps.
- Graph rendering keeps the original card classes, demo component order and coordinates, verified icons, edge descriptions, mobile component cards and themes. Dimension-aware layout, grouping, selection, highlighting and manual positioning are shared with real maps. A discovered bug retaining automatic bend coordinates after manual movement was fixed in `placeGraph`, with an orthogonal-routing/obstacle regression test.

### Intentional UI additions

- Compact `Map tools` disclosure contains revision/analysis details, relationship highlighting, expand/restore, layout, undo/redo, reset and exports. `Filters` discloses kind/provenance controls. These additions do not add rows above the desktop map.
- Trust keeps the original role prompt over the map; a matching policy editor below it supplies roles, resources, ownership, allow/deny, boundaries, confirmation and unexecuted exports. The graph caption is hidden in Trust so it cannot overlap the prompt.
- Workflows keeps the original locked-order demonstration and Guard Integrity link. The model editor below the workspace supplies states, actors, transitions, invariants and unexecuted plans. State-edge details are inspected through the editor/table instead of overlapping state labels.
- Annotation and discovery disclosures sit below the workspace. Source freshness/reanalysis controls appear only for authorized GitHub sources. Real graphs carry no demo security results.
- `src/app/icon.svg` copies the existing shield/W brand paths into a browser icon. This fixes the independently observed missing-favicon console 404 without changing application layout.
- At 1440 and 1280, the desktop toolbar and workspace have the exact baseline bounding boxes. At 390, the map moves down 4px because the graph/list control is now usable; its width and card structure match the baseline. The normal mobile view keeps the original component-card presentation; the list toggle exposes filtering and connection inspection.

### Migration register

Selective integration from `baec634`, not a branch merge:

| Paths                                                                                                                                                                | Treatment                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/features/canvas/{types,contracts,cache-contracts,validation,service,export,cli}.ts` / `run.mjs`                                                                 | Reused graph contracts, validation, export and CLI.                                                                |
| `adapters/{demo-source,fixture-graphs,local-snapshot,overlay-unavailable,overlay-validation,persistence,snapshot-source}`                                            | Reused scoped adapters; demo presentation order exported without changing fixtures.                                |
| `discovery/{analyzer,source-parser,snapshot,safety,fixtures}`                                                                                                        | Existing discovery engine unchanged; no second parser.                                                             |
| `server/{github-api,github-reader,graph-cache,graph-service,project-service,project-canvas}`                                                                         | Existing authorized source reads, pinned SHA, private cache, revision checks and nonblocking refresh unchanged.    |
| `graph/{model,ids,groups,routing,layout}`, `hooks/use-canvas`, `trust/model`, `workflows/model`                                                                      | Reused models/controller/layout; corrected stale manual-route bends.                                               |
| `components/{graph,graph-node,graph-edge,inspector,evidence-panel,manual-editor,trust-lens,workflow-lens,canvas-loading,source-error,live-canvas,canvas.module.css}` | Reused capabilities and adapted presentation to master. The independent `canvas-page.tsx` is intentionally absent. |
| `src/app/api/canvas/[projectId]/route.ts`, catch-all page, `repository-projects.tsx` and two-line Projects wiring                                                    | Minimal production integration; existing auth/session/account store retained.                                      |
| `package.json`, lockfile                                                                                                                                             | Existing Dagre dependency only.                                                                                    |
| `.env.example`, ESLint test-host ignore, Canvas docs/tests and GitHub source fixture/runner extensions                                                               | Retained setup, authorization/cache/discovery/editor coverage. No credentials copied.                              |

Legacy walkthrough tests predated master's authenticated landing/onboarding changes. Their obsolete landing CTA and synthetic OAuth steps were updated to master's existing `/demo` redirect and current GitHub error behavior. All finding/remediation, incident outcomes, notification previews, Ghost/Intelligence, reset, modal, route and accessibility assertions remain. UI-only identity mocks are isolated from production session/OAuth tests.

## Evidence and validation

Baseline screenshots were captured from the original `1ed8457` view **before porting**. `capture-master.mjs` now verifies that original view's Git blob before allowing baseline replacement. Baseline and integrated screenshots for Canvas, Trust, Workflows, Dashboard and Projects, plus exact geometry JSON, are in `evidence/canvas-master-integration/`. The baseline host reused the original production components with a clearly defined public-account test fixture; it did not exercise authentication. Actual source screenshots remain in ignored `test-results/github-live/` so private architecture/account data is not published in the PR.

Current check results are recorded in [CANVAS_VALIDATION.md](CANVAS_VALIDATION.md). No CI, merge or deployment success is inferred from local results.

Final local gates: typecheck, lint, 204 unit tests, production build, 18 Canvas/visual scenarios, 6 existing prototype regression scenarios, 21 auth/session/GitHub fixture scenarios, one actual GitHub/browser check and one actual warm-cache benchmark all passed. Actual acceptance covers 9 nodes, 6 edges and 53 evidence records at a pinned commit, cache HIT with zero reanalysis, reload and all three viewport sizes; browser console errors and failed resources were empty. Rechecked origin/master after implementation: still `1ed8457`; original development branch heads are unchanged. Final staged diff is reviewed against that master baseline before commit.

## Remaining integrations and limits

- Actual-provider acceptance covers the one repository selected by the current saved local session. A fresh interactive GitHub OAuth ceremony and a second actual repository are not claimed. Isolated provider fixtures cover installation/onboarding/login failure paths; ten graph families cover differing graph shapes.
- Source observations do not establish deployed behavior. Discovery retains its documented partial framework/dependency coverage, bounded source reads and exclusion diagnostics.
- Private graph cache remains encrypted and access checked. It is local filesystem storage with process-local work deduplication, not a distributed service.
- Real annotations/models are tab-memory scoped, survive compatible revision swaps, and are lost on browser reload. Demo annotations use the existing versioned local storage. Shell Reset demo and Reset Canvas edits remain separate, as tracked in CAN-017.
- **CAN-008 (S10, 2026-11-19):** the live Security lens now receives a Sentinel-backed overlay through the existing `LiveCanvas -> Canvas` `ports.overlays` seam (no graph-engine, analyzer or cache change). Incidents appear only where persisted route evidence matches exactly one source-observed API node of the displayed revision; everything else is listed as "not placed". Coverage labels: not_monitored / partial / stale / failed / unavailable. Trust and Workflow lenses are unchanged (`not_tested` / `not_executed`). Mocked-transport and isolated-PostgreSQL acceptance only; see SENTINEL_S10_VALIDATION.md.
- Guard scans/results, Sentinel telemetry/enforcement, Intelligence results, Trust verification and Integrity execution remain dependencies. Expected policies stay Not tested and exports stay Not executed. No scanner, runner, telemetry, database migration or deployment was implemented.
