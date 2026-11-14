# Canvas performance and graph redesign

## Master-preserving UI integration measurements

The following new measurement uses the master Canvas shell plus the existing authorized cache/discovery stack, on `integration/canvas-master-preserved` (14 November 2026). One actual GitHub repository selected in the saved local account, 9 nodes and 6 edges, same pinned commit. Three production browser openings took 2.85s, 1.02s and 2.32s including fresh authorization and browser rendering. Authorized cache load ran the analyzer zero times; the cache API returned HIT / `x-canvas-analysis-runs: 0`. No source-tree/blob retrieval occurred in this warm-cache measurement; its four GitHub requests rechecked authorization. Timing is local and network-dependent, not a performance guarantee.

The expanded actual-provider browser check separately passed reload, evidence inspection, Guard/Sentinel isolation, Architecture/Trust/Workflows at 1440x900, 1280x900 and 390x844, dark architecture screenshots, and zero console errors/failed resources. Redacted summary: `evidence/canvas-master-integration/live-validation.json`; private screenshots and raw measurements remain ignored under `test-results/github-live/` and `test-results/canvas-performance/`. The main architecture layout/cache modules are reused; only the stale-bend repair for manual coordinates changes routing. Historical measurements below describe the previous integration UI.

Local work on `integration/canvas-github-live`, starting at `1d361e5`, 14 November 2026 (Asia/Jakarta). The existing checkout and branch were retained. No auth/session/onboarding rewrite, discovery parser replacement, database, worktree, deployment or master merge.

## Measured problem

The baseline production flow was Projects → RSC project route → local session/profile → GitHub grants → commit/tree → bounded blob downloads → analyzer → serialized graph → client `useCanvas` effect → layout → React Flow.

Every visit called `GitHubRepositorySnapshotReader.getSnapshot` again. There was no graph store. The route's Suspense boundary waited for all source reads, and the feature waited for a second client effect before displaying the supplied graph. The React Flow provider was keyed by revision, which discarded local view state on updates. Layout depended on a merged graph that was cloned for notes and manual edits, rather than topology. The old layout put all cyclic nodes in one last column, used constant dimensions and displayed verbose edge labels. These were separate loading and readability problems.

Baseline on the same actual selected GitHub repository, production Next server, headless Edge, 1440 × 900:

| Stage                                      | Measured baseline                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Three Projects → usable Canvas navigations | 14,034 ms; 13,242 ms; 13,256 ms                                                                                |
| Source snapshot wall time                  | 13,151 ms                                                                                                      |
| GitHub requests for that snapshot          | 90 total, including tree, 77 blobs, revision, grants and cleanup                                               |
| Tree response                              | 407 ms                                                                                                         |
| Blob responses                             | Approximately 310–820 ms each, concurrency capped at four; overlapping requests must not be added as wall time |
| Analyzer                                   | 326 ms, including cold parser work                                                                             |
| JSON serialization                         | 0.17 ms; 47,378 bytes before transport compression                                                             |
| Old layout                                 | 0.64 ms for nine nodes/six edges                                                                               |
| RSC transfer, including server wait        | 12,656–13,439 ms; about 4.7 KB transferred per graph response                                                  |

The analyzer was not the dominant repeated-navigation bottleneck. Full source retrieval was. Benchmark scope: baseline versus the integrated cached path, three navigation samples each, one local selected repository, existing discovery correctness and authorization regressions as gates. This is a small local sample, not a p95 or production load test.

## Authorized persistent cache

`CanvasGraphStore` separates storage from the lifecycle service. `FileCanvasGraphStore` implements it under `AUTH_DATA_DIR/canvas-graphs-v1`, outside the checkout/public assets. A future PostgreSQL implementation can replace the store without replacing discovery or OAuth.

Names contain only hashes and a validated commit SHA. The key includes user/workspace scope, provider, installation ID, stable repository ID, owner/name, analyzer version, graph schema and commit. Owner/name or analyzer/schema changes invalidate compatible lookup. The latest usable entry is selected by a successful write; no unverified HEAD is stored as analyzed.

Graph-only envelopes use the existing server AES-GCM sealing helpers, a per-file authenticated context, restrictive creation permissions, byte limits, and atomic same-directory replacement with Windows retry. Explicit field projections exclude arbitrary provider credentials, raw source and unknown metadata. Installation/user tokens never enter cache records, client graphs, browser persistent storage or cookies. Every read validates/decrypts and decodes the graph. Corrupt, expired, mismatched and incompatible files are misses. Normal entry limits are 4 MB/graph, 128 entries, 64 MB total, and seven days; expired/old entries are pruned on successful writes. This is a local single-process cache, not a retention scheduler or distributed store.

Every graph route/API request resolves the current session, completed onboarding and selection, and independently checks GitHub user identity, user installation membership, current repository access, App installation ownership/suspension and read permissions. Independent provider checks run concurrently; no permission TTL or cached grant bypasses GitHub. A local session/selection check is repeated before serving cache content. Known provider denial or uncertainty purges that user's project namespace and fails closed. An authorization error never serves a stale private graph.

The route authorizes and reads disk without waiting for HEAD or source analysis. A validated cached graph seeds the renderer immediately. An uncached project gets the Canvas-shaped skeleton. The remaining route-level authorization wait is a small status in the existing shell, not a repeated full graph skeleton.

## Revision lifecycle

The client starts a nonblocking **Check for updates** request. Same HEAD returns status only and does not read tree/blobs or run discovery. A new HEAD shows **New revision available**, retaining the previous analyzed SHA/time and map. **Update map** prepares the new source graph and replaces it only after validation and persistence. A checked cache revision different from the displayed revision is still shown as an update; it is never mislabeled as current.

**Reanalyze repository** has a separate confirmation dialog and forces source analysis even for unchanged HEAD. **Reset Canvas edits** and **Reset layout** remain separate operations. Cache-backed warm navigation keeps route prefetch disabled: speculative private source responses are not reused as a substitute for current authorization.

The API uses `private, no-store`, cookie variation and origin checks for refresh/reanalysis. Its timing headers distinguish authorization, disk, HEAD and analysis; cache hit and analysis-run headers make warm behavior inspectable. Concurrent requests authorize independently and share an in-flight analysis keyed by tenant/repository/revision/analyzer/schema. Coordination is per process; multi-instance job coordination remains future work.

Failed HEAD/source refresh keeps the previous map only after authorization succeeds again. When authorization cannot be confirmed, the client removes private graph content and offers recovery. Network operations and discovery remain bounded; no fake percentages/stages are displayed. A previous revision is labeled as previously analyzed while freshness is unknown.

Manual annotations/models/positions use a bounded tab-memory namespace for real projects. They survive client navigation and successful revision swaps, with stable source IDs. They do not survive a full browser reload, session end, eviction, another tab or another device. Generated graphs survive backend restarts independently. Unmatched annotations remain exportable; removed components produce diagnostics. The revision key no longer remounts React Flow. Demo persistence and synthetic overlays remain separate.

## Layout and interactions

[Dagre](https://github.com/dagrejs/dagre/wiki) was selected for deterministic dimension-aware directed layout, cycle handling, crossing reduction and detected package containers. [ELK](https://github.com/kieler/elkjs) was evaluated for its more advanced routing/compound capabilities. Installed package metadata was approximately 1.42 MB unpacked for Dagre versus 8.23 MB for ELK. The actual Dagre ESM file plus Graphlib dependency measured 62,048 bytes / about 21.6 KB gzip before Next bundling. Package unpacked size is not a browser-transfer measurement.

Dagre positions are sorted deterministically and account for bounded title-driven node sizes, node/rank/edge separation, real connectivity and source `groupId` boundaries. An exact segment/rectangle regression exposed a Dagre edge crossing an unrelated component; a bounded rectilinear A* repair now reroutes offending segments around node rectangles. The router caps grid/visited states at 100,000 and shows a routing-budget notice if it cannot finish. It does not invent architecture edges. Manual positions are preserved; automatic placement and routes are cached by topology, dimensions and manual coordinates. Selection, notes, lenses and security state do not rerun Dagre.

Detected package groups become expandable source boundaries. Source graphs with more than 18 nodes and real source groups start collapsed into a useful overview. Collapsed connections project existing source relationships; exports still retain the original graph. Additional role categories are explicitly presentation groups and create no architecture/evidence nodes. **Fit selected group**, **Expand map**, direct/upstream/downstream highlighting, search and the inspector provide detail progressively.

Node dimensions reserve room for titles, metadata and badges. Long titles wrap/truncate inside their bounds; full values remain in tooltips/list/inspector. Low zoom prioritizes names and hides metadata; edge details appear on hover/selection or through the accessible connection list. Only the active edge label is emphasized. De-emphasis uses borders instead of reducing text contrast. The architecture renderer unmounts on mobile instead of drawing a zero-width hidden React Flow; the accessible list and inspector remain available.

Limits: automatic geometry does not overrule two deliberately overlapping manual positions. Very large/dense maps can still need group expansion, zoom or the list; an overview cannot show every full label simultaneously. Routing is bounded and does not promise zero edge crossings. Complex framework discovery remains partial as before. No scanner, runtime verification, AI inference or external provider backend was added.

## Local verification

Preserve `.env.local` and the existing GitHub App setup. Use Node 22.20+. Stop this checkout's server before rebuilding on Windows, then:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Log in at `http://localhost:3000`, open Projects → Open Canvas, then return to Projects and reopen. Refresh the browser and restart the server: the generated graph should remain cached, with current GitHub authorization required each time. Use **Check for updates**, **Update map** when offered, and the separate confirmed **Reanalyze repository** action. An API cache hit should report `X-Canvas-Cache: HIT`, `X-Canvas-Analysis-Runs: 0`, and `Server-Timing` with authorization/disk timings and zero analysis.

```powershell
$env:CANVAS_TEST_PORT = '3216'
npm run test:e2e -- --config tests/canvas/playwright.config.ts
Remove-Item Env:CANVAS_TEST_PORT
node tests/auth/run-github-e2e.mjs
```

The existing fixture host is only a test host, not another WetScan project or live auth proof. Visual tests cover ten synthetic graph families at 1440 × 900, 1280 × 900 and 390 × 844, plus expanded package views, title/node bounds and responsive overflow. Unit geometry also checks segments against unrelated nodes, cycles and deterministic topology. Auth/browser tests use isolated provider fixtures; revision changes/failure UI responses are controlled fixtures, distinct from actual-provider timing.

To repeat the opt-in real-provider warm benchmark, with a current completed local login and the production server running:

```powershell
$env:CANVAS_BENCH_PHASE = 'after'
npx vitest run --config tests/canvas/performance.config.ts --reporter=verbose --disableConsoleIntercept
Remove-Item Env:CANVAS_BENCH_PHASE
```

It uses an existing unexpired authenticated local record through a temporary verification session, then deletes that temporary session. It never selects additional repositories, revives an expired token or logs credentials/source. The warm phase requires an existing cache hit. Baseline measurements are already recorded; running the baseline phase against the new code is not a reproduction of the old commit. Local benchmark JSON/screenshots remain under ignored `test-results/canvas-performance`.

## Final results

Production-build measurements on the same machine and actual selected repository (nine nodes/six edges):

| Measurement                                     | Before                                          | After                                                    |
| ----------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Projects to visible usable graph, three samples | 14,034 / 13,242 / 13,256 ms                     | 1,254 / 973 / 985 ms                                     |
| Median navigation                               | 13,256 ms                                       | 985 ms (92.6% lower wait; 13.5 times faster)             |
| Foreground backend graph preparation            | 13,151 ms source snapshot, then 326 ms analysis | 640 ms authorized cache load; zero analysis              |
| Warm authorization / disk lookup                | Not separately instrumented in the old route    | 619 / 14.7 ms                                            |
| Foreground GitHub calls                         | 90 snapshot calls                               | Four live authorization calls; zero tree/blob/HEAD calls |
| Source analyzer                                 | 326 ms                                          | Zero runs on cache hits                                  |
| JSON serialization                              | 0.17 ms                                         | 0.15 ms; same 47,378-byte graph                          |
| Cold layout computation                         | 0.64 ms, old simple layout                      | 38.7 ms, dimension-aware Dagre plus routing              |
| RSC response including wait                     | 12,656–13,439 ms                                | 437–643 ms, about 4.75 KB transferred                    |

The warm navigation target of **under 500 ms is not met**. Current external authorization alone can take approximately 0.4–1 second. One independent warm API request took 1,042 ms, with `HIT`, zero analysis runs, and 1,006 ms in authorization. Local session locking, provider latency, navigation, hydration and rendering contribute to the remaining wait. React Flow's initial paint was not independently isolated from that navigation remainder, so no separate paint improvement is claimed. The stronger layout costs more than the old nine-node column layout; it is reused until topology/dimensions/positions change.

A warm visit also starts a separate nonblocking check with four fresh authorization calls and one HEAD call. The foreground four-call number is not the total for the whole visit. The first uncached visit still requires the bounded source download and can take roughly 10–15 seconds in this local repository. These changes remove repeated download/analysis, not the initial source/network cost.

Actual restart evidence: the stored graph was generated at `2026-11-14T06:46:20.409Z`; a new production server process started at `2026-11-14T07:11:24.8319982Z` returned that same generated time and SHA with zero analysis runs. Browser reload/navigation were also checked against this cache. Actual-provider measurement covers **one authorized repository**. Cross-user/workspace/repository isolation, revocation and revision changes have automated fixture coverage; they are not a claim of two real repositories or actual provider revocation testing.

Validation completed locally:

- `npm run typecheck`, `npm run lint`, `npm test` (203 tests in 12 files), and `npm run build`: passed.
- Canvas Playwright: 17/17 passed, including ten graph families at all three requested sizes, geometry assertions, accessibility and existing Canvas interactions. Thirty overview screenshots plus two expanded group screenshots were captured; the monorepo scenario was rerun successfully after the final inspector fallback text correction.
- Existing auth/dashboard production-build runner: 21/21 passed, including cache reload, revision refresh/failure, retained notes, denied access and cross-origin mutation protection. Provider responses in this runner are fixtures.
- No CI, cloud deployment, database integration, distributed-cache test or production-readiness assertion.

Selected **synthetic fixture** screenshots are retained in the repository; no private real-repository graph or account screenshot is included:

| Example                        | Screenshot                                                                |
| ------------------------------ | ------------------------------------------------------------------------- |
| Small connected graph          | [1440 desktop](../evidence/canvas-performance/small-1440.png)             |
| Monorepo summary               | [1440 desktop](../evidence/canvas-performance/monorepo-1440.png)          |
| Expanded package and inspector | [1440 desktop](../evidence/canvas-performance/monorepo-expanded-1440.png) |
| Long titles                    | [1440 desktop](../evidence/canvas-performance/long-titles-1440.png)       |
| Dense relationships            | [1280 desktop](../evidence/canvas-performance/dense-1280.png)             |
| Cyclic dependencies            | [1440 desktop](../evidence/canvas-performance/cycles-1440.png)            |
| Large grouped graph            | [1440 desktop](../evidence/canvas-performance/large-1440.png)             |
| Accessible mobile list         | [390 mobile](../evidence/canvas-performance/monorepo-390.png)             |

Remaining backlog: durable manual-edit database storage, multi-instance job coordination, broader framework inference, richer nested-group routing, larger-repository profiling and authorization latency investigation without bypassing provider checks. Expanded long dependency chains can still need zoom or the component list; deliberately overlapping saved manual positions remain the user's positions.

## Changed files

The implementation stays on the existing `integration/canvas-github-live` branch. File responsibilities:

- Cache/lifecycle: `src/features/canvas/cache-contracts.ts`, `server/{graph-cache,graph-service,project-service,github-reader,project-canvas}.ts[x]`, and `src/app/api/canvas/[projectId]/route.ts`.
- Rendering/navigation: `src/app/app/[...path]/page.tsx`, `src/features/canvas/components/{canvas-page,canvas-loading,live-canvas,graph,graph-node,graph-edge,inspector}.tsx`, `canvas.module.css`, `hooks/use-canvas.ts`, and `adapters/persistence.ts`.
- Geometry/grouping: `src/features/canvas/graph/{layout,routing,groups}.ts`.
- Tests: `tests/canvas/{graph-cache.test,layout.test,visual-graphs,layout-visual.spec,performance.check,performance.config,playwright.config}.ts`, `tests/canvas/fixture/app/app/[...path]/page.tsx`, and `tests/e2e/github-canvas.spec.ts`.
- Dependency/tooling: `package.json`, `package-lock.json`, `eslint.config.mjs`.
- Documentation/evidence: `README.md`, `docs/{CANVAS_PERFORMANCE,CANVAS_ARCHITECTURE,CANVAS_VALIDATION,CANVAS_GITHUB_INTEGRATION,INTEGRATION_BACKLOG}.md`, and `evidence/canvas-performance/*`.
