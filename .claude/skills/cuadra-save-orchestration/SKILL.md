---
name: cuadra-save-orchestration
description: >-
  The BUILT orchestration console of Save (F4 COMPLETE — merged to developer, PR #37): the admin
  surface that operates the ingestion pipeline — provider-flows with their policy in DB, run now /
  retry / cancel, cascade outcome metrics, a DB-driven sensor that makes the admin's cron actually
  rule, and the run→queue deep-link (`?run_id=`). Owns the hard-won internals: the port is named by
  ROLE (`PipelineOrchestrator`) and the adapter speaks RAW GraphQL because `dagster` is NOT in the
  API's deps, the run selector is ASKED of the server (hardcoding it never launches anything), a
  partitioned job MUST be launched WITH its partition (`partition_key_for` + the `dagster/partition`
  tag — else the run dies at 3s), Dagster is owner of run STATE while we own what a run PRODUCED,
  `new_canonicals` is DERIVED not stored, and exactly-once comes from `RunRequest.run_key` without a
  cursor. Composes with cuadra-save-admin (the console shell),
  cuadra-save (domain), cuadra-save-matching (what fills the queue) and cuadra-api. Trigger:
  building, extending or DEBUGGING anything under `contexts/save/{application/orchestration*,
  application/policy_schedule,domain/entities/orchestration*,domain/ports/orchestrator,
  infrastructure/orchestrator}`, `api/v1/controllers/admin_orchestration.py`,
  `ingestion/save/policy_sensor.py`, or the web feature `save-orchestration`.
---

> **Your role when this skill is active:** an architect who treats an operations console as a
> production system. This console is the ONLY access control over the runner — **Dagster OSS has no
> authentication of its own** — and every number it shows is a number an operator will act on. A KPI
> that shows `0` when the truth is "we could not ask" is the most expensive lie this module can tell.

> **Compose — don't duplicate.** `cuadra-save-admin` owns the admin shell (guards, capabilities,
> i18n, audit). `cuadra-save` owns the domain + sacred rules. `cuadra-save-matching` owns the
> cascade that fills the review queue. `cuadra-api` owns hexagonal/TDD/Alembic. THIS skill owns the
> orchestration module built on top of them.

## When to Use

- Anything under `contexts/save/domain/entities/orchestration*.py`, `domain/ports/orchestrator.py`,
  `application/{orchestration_policies,policy_schedule}.py`, `infrastructure/orchestrator/`.
- `api/v1/controllers/admin_orchestration.py` (9 gated routes) or `ingestion/save/policy_sensor.py`.
- The web feature `apps/web/src/features/admin/resources/save-orchestration/`.
- Turning the matching cascade ON (#4.7 — see `docs/pending/save-fase4-orquestacion-pendientes.md`).

## The doctrine (one line that settles most arguments)

> **Dagster is the owner of a run's STATE. We are the owners of what the run PRODUCED.**

Everything else follows: run status/timing comes LIVE from the bridge (never stored — the snapshot is
written from INSIDE the run, so a stored status would forever read "running"); our metrics live in our
DB (Dagster's event log is prunable and its API is declared unstable, and §5.3 says run history is
append-only and sacred).

## Critical Patterns (the gotchas — do NOT relearn)

1. **The adapter CANNOT import `dagster`.** `dagster`/`dagster-graphql` live in the `ingestion`
   dependency group, NOT in `[project].dependencies` — the API image does not ship them. This module
   is imported by the admin controller, so importing the SDK crashes the API at boot in production,
   invisibly in local. It speaks **raw GraphQL over httpx**. Guard:
   `tests/save/unit/test_dagster_orchestrator.py::test_the_adapter_does_not_import_dagster` (walks
   the **AST** — grepping the text false-positives on the docstring that explains the rule).
2. **The port is named by ROLE, not vendor.** `PipelineOrchestrator` (port) →
   `DagsterGraphQLOrchestrator` (adapter). Every port in this context follows it (`CatalogSource`,
   `EmbeddingProvider`, `PushSender`, `CategoryJudgePort`). A vendor name in the domain inverts the
   dependency import-linter enforces.
3. **ASK the server for the run selector — never hardcode it.** `launchRun` needs
   `repositoryLocationName` + `repositoryName`. Hardcoded to `""` it yields
   `Could not find Pipeline ..<job>` and **never launches anything** — and no test with a fake
   transport can see it, because the fake does not validate the selector. Resolved via
   `repositoriesOrError` and cached. Real values today: `ingestion.definitions` / `__repository__` —
   the first is the MODULE NAME, so hardcoding breaks silently on a move.
4. **Introspect the installed package, never trust the docs.** The public Dagster docs claim the
   Python client has no cancellation; it does (`terminate_run`/`terminate_runs`). Get the real
   surface with `create_schema().graphql_schema` from `dagster_graphql` (needs `--group ingestion`).
5. **GraphQL fails with HTTP 200 — in TWO ways.** The `errors` array, and the error member of a
   **union** (`__typename`). An adapter that checks only the HTTP status returns an empty list and
   the console says "no runs" when it could not ask. Both become `OrchestratorUnavailable`.
6. **The 9 real run states → 7 operational ones.** Dagster: `QUEUED, NOT_STARTED, STARTING, STARTED,
   SUCCESS, FAILURE, CANCELING, CANCELED, MANAGED`. The spec assumed 5 and missed QUEUED/STARTING —
   a queued run would look like "nothing happened". `MANAGED` → `UNKNOWN` (mapping it to `running`
   would be a guess); an unrecognised state → `UNKNOWN`, never an exception (Dagster declares its
   GraphQL unstable, so an upgrade cannot take the console down). **`UNKNOWN` enables NO action.**
7. **Correlation is by TAGS, not by a fragile join.** Every launch is tagged `cuadra/policy_id`,
   `cuadra/trigger`, `cuadra/actor_user_id`; `RunsFilter.tags` retrieves them exactly. The SAME tags
   are used by "Run now" and by the sensor, so correlation works regardless of origin.
8. **`new_canonicals` is DERIVED, never stored.** A run does not create canonicals — a HUMAN does,
   resolving the queue, possibly days later. Frozen at run end it would read 0 forever. Counted via
   `canonical_product.origin_run_id` (index `ix_canonical_product_origin_run`).
9. **`execution_mode` has THREE values**, because the pipeline has three trigger mechanisms:
   `manual` · `automatic_chain` (an `AutomationCondition` pulls it — the ORDER comes from dependency,
   not the clock) · `cron`. Offering a cron field on a dependency-driven flow is a UI that promises
   what the pipeline ignores. The invariant lives in the ENTITY, not the form.
10. **The sensor gives exactly-once via `run_key`, WITHOUT a cursor.**
    `run_key = "{policy_id}:{tick_iso}"` — Dagster skips a RunRequest whose run_key it already used,
    so evaluating every 60s against a 2-hour cron yields ONE run, not 120. Mixing run_key with a
    cursor breaks the cursor's reset, and the state that matters already lives in our DB.
11. **`cronsim(reverse=True)` returns the tick STRICTLY BEFORE now.** At exactly 14:00:00 it returns
    12:00, so a sensor evaluating on the boundary would lose that firing. Fixed with `now + 1s`
    before computing. The tick is computed in the **policy's** timezone, never the server's.
12. **`cronsim` is restricted to 5 fields** even though it accepts 6 (seconds): the sensor ticks at
    ~60s, so accepting seconds would promise precision we cannot honour. **Same library on BOTH
    sides** (API computes `next_run_at`, sensor decides firing) — two libraries would show a next-run
    that disagrees with the real firing. Do NOT use `dagster._utils.schedules`: private module.
13. **A paused policy still occupies the uniqueness slot.** Otherwise duplicating is as easy as
    pausing the original. The unique index is PARTIAL (`WHERE deleted_at IS NULL`) so a retired
    policy does not block its replacement — no hard-delete, ever (§5.3).
14. **Provider-flow eligibility DERIVES from `directed_capability`, never an allowlist.** Bravo is
    REST_CATALOG **and** `by_text`, so a platform allowlist would reject it and the console would be
    born with the hardcode R1 had just killed. `capability_of` is INJECTED from the composition root
    because only the layer that knows the REST profiles can answer for a concrete source.
15. **Runner down → 503, never 500**, and the LIST degrades instead of failing: the policy lives in
    our DB and that is exactly when the operator most needs to see it. Runner health is DECLARED by
    the backend (`ProviderFlowListDto.runner_available`) — the frontend must NOT infer it from
    "no row has metrics", because **a flow that never ran looks identical to a dead runner**.
16. **Python `Protocol`s are STRUCTURAL — they guarantee nothing about the real adapter.** A fake
    implementing an invented signature keeps the suite green while the endpoint 500s (this happened:
    `get_by_provider` vs the real `get_by_provider_id`). Guard:
    `tests/save/unit/test_orchestration_protocol_conformance.py`.
17. **The flow→job map has ONE home**: `JOB_BY_FLOW` in `domain/entities/orchestration.py`, consumed
    by both "Run now" and the sensor. It was duplicated once; adding a flow and updating only one
    side makes the manual button work while the schedule silently never fires. A test demands every
    declared flow has a job.
18. **A PARTITIONED job MUST be launched WITH its partition, or the run dies at 3s.**
    `save_query_catalog` is partitioned by `provider_id`; launching it without a partition yields a
    non-partitioned run and the asset raises `Cannot access partition_key for a non-partitioned run`.
    It passed green for a whole phase because **`launchRun` returns a run_id (Dagster ACCEPTS the
    launch)** and the failure only happens at asset EXECUTION — a smoke that asserts "launch returned
    an id" never sees it. Same home as #17: the domain helper
    `partition_key_for(flow_key, provider_id)` (+ set `PROVIDER_PARTITIONED_FLOWS`) decides; BOTH
    `RunPolicyNow` and the sensor (`DuePolicyRun.provider_id`) pass it. The adapter appends the
    `dagster/partition` tag — value INTROSPECTED from `PARTITION_NAME_TAG`, NEVER imported (the
    adapter cannot import dagster, gotcha #1). A wiring test must EXECUTE a real run, not just check
    the returned id. Guards: `test_orchestration_partition.py`, `test_run_policy_now.py`.

19. **The SLA is a DOMAIN rule, not a front-end formula.** `OrchestrationPolicy.sla_status(last_success_at, now)`
    → `within | breached | not_applicable`. Three parts of the definition, all load-bearing:
    (a) only the last **SUCCESSFUL** run moves the mark — otherwise a flow failing every 5 minutes
    looks like the freshest of all; (b) `manual` is **never late** (no schedule to miss) → it returns
    `NOT_APPLICABLE` and the KPI must drop it from the **denominator**, or the console reads
    *"0/3 within SLA"* with everything healthy; (c) no `sla_minutes` (or ≤ 0) → nothing was promised,
    so nothing is measured. A scheduled flow that never succeeded is `BREACHED`, not "unknown".
    It lives in the domain so the list KPI and the per-provider detail can never disagree.
20. **`list_runs(states=)` filters SERVER-side, and the reverse state map has ONE home.**
    `runner_statuses_for()` sits next to `_RUNNER_STATES` in `orchestration_run.py` — two maps
    desynchronise the moment someone adds a state to one. It is 1→N on purpose (`RUNNING` covers
    `STARTING`+`STARTED`). Pulling the whole history to filter in Python does not scale: a flow that
    fails often can have its last success hundreds of runs back. The controller skips the second
    round-trip when the last run already succeeded.
21. **The integration fake accepts `**_`, so a new port argument is INVISIBLE to the suite.**
    `test_orchestration_protocol_conformance` only checks `hasattr` — it cannot see signatures. When
    `states=` was added, nothing covered it. The guard is `_RunsByState` in
    `test_admin_orchestration_api.py`: a fake that actually *distinguishes* the filter, plus the test
    that matters — *"a failing flow does NOT inherit freshness from its failed run"*. Any new port
    argument needs a fake that can tell the difference, or gotcha #16 bites again in a new place.
22. **Base UI: `DropdownMenuLabel` MUST be inside a `Menu.Group`/`Menu.RadioGroup`.** Outside it
    throws at runtime — `MenuGroupContext is missing` — and the whole menu fails to open. It passed
    typecheck and only a render test caught it. **And a filter panel is a `Popover`, not a `Menu`**:
    menus are for COMMANDS, and nesting a `<Select>` in one fights its click-outside close (the
    select popup portals OUTSIDE the menu and counts as "outside"). `@base-ui/react/popover` with
    `align="end"` opens leftward so the panel does not cover the table it is filtering.

23. **Two timestamp conventions in the SAME Dagster schema.** `Run.startTime` is a **float in
    SECONDS**; `MaterializationEvent.timestamp` is a **`String!` in MILLISECONDS** (its sibling arg
    is literally `beforeTimestampMillis`). Dividing the string crashes; treating it like a run
    timestamp yields dates around the year **57000** — absurd to an operator, perfectly plausible to
    a parser. The conversion lives in its own helper (`_materialization_ts`) and must NOT share
    `_epoch_to_dt`. Also: `AssetKey` is `{path: [segments]}`, not a string (joined with `/`, and the
    route needs `{key:path}`), and **`assetNodes` is a bare LIST while `assetNodeOrError` is a
    UNION** — a uniform `_unwrap` turns *"that asset does not exist"* (404) into *"the orchestrator
    is down"* (503).
24. **A field the API accepts for WRITE must be readable, or it is a trap.** `UpdatePolicyRequest`
    accepted `priority` and `PolicyDto` did not return it: the form read it through a cast, always
    got `undefined`, rendered empty, and **every save wiped it to `null`**. It never failed — it
    lied coherently, because an empty field looks like the truth. The PATCH uses
    `model_dump(exclude_unset=True)`, so the fix is that the key must NOT travel. Guard:
    `tests/save/unit/test_admin_dto_symmetry.py` compares each write/read DTO pair. Before adding a
    control to any admin form, check the field is in the **read** DTO, not just the `*Request`.
25. **CI was green for the reason that made it blind.** It ran `uv sync` WITHOUT
    `--group ingestion`, so `dagster` was absent, the 18 tests in `test_definitions.py` skipped via
    `importorskip`, and `sys.modules` stayed clean — which is precisely why the broken adapter guard
    passed there and failed locally. CI now installs the group AND runs `pytest tests/save
    tests/ingestion` as its own step. **If the backend verification is TWO numbers, the combined
    suite was never run.**

## Operating the runner (dev) — hard-won

- **Run EXACTLY ONE `dagster dev` at a time.** It spawns a tree (wrapper `uv run` → `dagster dev` →
  webserver + daemon + code-server + its `dagster api grpc`). Orphans piling up on the same
  `DAGSTER_HOME`/Postgres give `Another … daemon is still sending heartbeats… multiple daemon
  processes… not supported` → **runs fail**. Healthy = exactly 1 `dagster._daemon run` + 1
  webserver, and `grep -c "still sending heartbeats"` in the log == 0.
  **`scripts/dagster-down.sh` now takes the whole tree down and VERIFIES it** (fixed 2026-07-20 — no
  manual `pkill` sweep needed; it exits non-zero and lists survivors if anything resists). It had
  two bugs worth remembering: its pattern was `dagster.daemon` while the real process is
  `dagster._daemon` — the regex `.` eats the literal dot and then `daemon` cannot match `_daemon`,
  so it failed by ONE character and never killed the daemon; and it verified **port 3070** instead
  of the tree, so the webserver died, the port freed, and it printed `✓ Dagster apagado` with five
  processes alive. **A `✓` that checks a proxy instead of the thing itself is not evidence.** `scripts/dagster-dev.sh` already exports
  `SAVE_MATCHING_CASCADE_ENABLED=true` + `SAVE_REFRESH_QUERY_LIMIT=10` — the cascade runs INSIDE the
  Dagster process (the matcher is wired in `ingestion/save/composition.py`), NOT the API.
- **Launch/measure a run without the UI**: `POST /v1/admin/save/orchestration/policies/{id}/run`
  (super_admin token) → poll status via GraphQL `runOrError`; the produced metrics land in
  `orchestration_run_snapshot` (by `dagster_run_id`) and the queued matches in `product_match`
  (by `run_id`). `save_clean` does NOT touch snapshots — clear them by hand for a true reset.
- **Reset dev data**: `seeds.save_clean --ingestion` (keep canonicals) / `--reset` (drop canonicals →
  true cold-start) / `--provider NAME`. Dev-guarded to localhost:5433.
- **Measured baseline (2026-07-19, by_text live, LLM off, in-process BGE-M3, limit=10)**: auto-link
  depends on canonicals EXISTING — Sirena against the catalog = 48/48 auto-link/0 queue (re-match);
  Bravo = 13 auto / 68 queue (real discovery); Sirena cold-start (0 canonicals) = 0/48 queue. The old
  "85/15" was inflated. With the LLM off the grey band goes 100% to human.

## Where it lives

| Layer | Path |
|---|---|
| Domain | `contexts/save/domain/entities/{orchestration,orchestration_run}.py` (`JOB_BY_FLOW`, `PROVIDER_PARTITIONED_FLOWS`, `partition_key_for`) · `domain/ports/orchestrator.py` (`launch(partition_key=)`) |
| Application | `contexts/save/application/{orchestration_policies,policy_schedule}.py` (`DuePolicyRun.provider_id`) |
| Infrastructure | `contexts/save/infrastructure/orchestrator/{dagster_graphql,policy_repository,run_snapshot_repository}.py` |
| API | `api/v1/controllers/admin_orchestration.py` (9 routes, capability `ADMIN_SAVE_ORCHESTRATION_OPS`) |
| Ingestion | `ingestion/save/policy_sensor.py` (+ registered in `ingestion/definitions.py`) |
| Web | `apps/web/src/features/admin/resources/save-orchestration/` · `apps/web/pages/admin/orchestration/` |
| Migrations | `986cfadeb758` (policy+config) · `383f4c14de46` (run correlation) · `d9b8ab9bb88a` (snapshot) |

### Web feature map (console v2)

| File | What it owns |
|---|---|
| `components/OrchestrationScreen.tsx` | Shell, live-poll, pagination, confirmations, modal wiring |
| `components/OrchestrationRow.tsx` | The 8 columns (status · provider+logo · flow+mode · schedule · next · products · outcome · actions) |
| `components/OrchestrationActionsMenu.tsx` | Run / Retry / Cancel / Edit / Pause / Delete — each item shown ONLY when the runner state allows it |
| `components/OrchestrationToolbar.tsx` | Search + filter **Popover** (selects + Apply/Reset + active-count badge) + create CTA |
| `components/OrchestrationKpis.tsx` | `buildKpis` (pure, tested) + the 4 cards; inert `ChartSkeleton` when there is no data |
| `components/{PolicyModal,CreateFlowModal}.tsx` | Edit policy (3 modes; cron field only in `cron`) · create flow (surfaces the 422 REASON verbatim) |
| `lib/run-state.ts` | `isCancellable` / `isInFlight` — affordances derived from the runner's declared state |
| `lib/filter-flows.ts` | Pure client-side filter (search AND mode AND state); `NEVER_RAN` is a real, filterable state |
| `lib/run-queue-href.ts` | The run→queue deep-link (only when there IS a run and `queued > 0`) |

> Shared pieces this console consumes — see `cuadra-save-admin` §"shared UI inventory" **before**
> writing any new admin UI: `ProviderLogo`, `ConfirmDialog`, `KpiCard` + `RadialGauge`/`MiniBarChart`,
> `FilterField`, `FunnelIcon`, `Pagination`. None of them should ever be re-implemented locally.

## Security

**Dagster OSS has NO authentication**: whoever reaches the webserver controls the runner (launch,
cancel, delete). Therefore: the webserver is **never** publicly exposed, the API reaches it over a
private network, and the URL comes from config (`SAVE_DAGSTER_GRAPHQL_URL`), never hardcoded. The
capability `admin_save_orchestration_ops` is the only real access control over pipeline execution —
which is why it is its OWN capability and not a reuse of `admin_save_ingestion_ops`.

The `ssrf_guard` from `catalog_sources` is deliberately NOT used here: that guard exists because
there the URL is typed by an ADMIN (untrusted input) and it forces HTTPS and rejects private hosts.
Here the URL is our own internal infrastructure and the guard would reject the legitimate case.

## Commands

```bash
cd apps/api && uv run pytest tests/save -q                    # includes all orchestration tests
cd apps/api && uv run --group ingestion pytest tests/ingestion -q
make openapi && pnpm --filter @cuadra/web typecheck           # contract-first
./scripts/dagster-dev.sh      # runner UI :3070   ·   ./scripts/dagster-down.sh
# introspect the REAL GraphQL surface (never trust the docs):
cd apps/api && uv run --group ingestion python -c "
from dagster_graphql.schema import create_schema
s = create_schema().graphql_schema
print(sorted(s.mutation_type.fields))"
```

⚠️ **After editing `.env`, RESTART the API.** `settings` is a module-level singleton and uvicorn's
file-watch reloads on CODE changes, not on `.env`.

## Status + what's left

**F4 COMPLETE — merged to `developer` (PR #37 squash, commit `404618a`).** #4.1-4.7 + #4.2b + the
launch-partition fix. The cascade has been ACTIVATED and measured against the live APIs (see the
baseline above). Full record: `docs/pending/save-fase4-orquestacion-pendientes.md`.

**CONSOLE v2 — branch `feat/save-orchestration-console-v2`, NOT yet committed.** Closes the whole
unblocked part of the SDD's §14 backlog: P0 (paint the metrics that already travelled · wire the
zombie `retryRun` · strong confirmation on Cancel · live refresh while a run is in flight), P1
(policy + create-flow modals · Delete in a secondary menu · search & filters), the **SLA KPI**
end-to-end (#12), pagination, the admin visual language, and US-OR-L5 (the UI now declares what
policy lives in env and cannot be changed from the console).

**Left for later — every item is blocked by signal or endpoints that do not exist yet:**

| §14 | Item | Blocker |
|---|---|---|
| #9, #10 | "Assets Dagster" tab + the tab bar | `GET …/orchestration/assets` + `list_assets`/`get_asset`/`get_lineage` on the port. **All or nothing** — an empty tab lies, and one lone tab is decoration |
| #11 | Provider detail `/admin/orchestration/providers/{id}` | The sibling SDD; its own branch |
| #13 | KPIs "runs succeeded/failed today" | The bridge only exposes runs per policy, not a global per-day listing |
| #14 | Progress bar `queries_processed/total` | **Nobody counts queries.** `seen` counts products returned, not searches issued |
| #15 | `log_excerpt` / run events | `get_run_events()` on the port |
| #16-19 | `provider_coverage` handler · `depends_on_flow` (R7) · `scope=asset` policies · one-off run overrides | v1.1 backend work |

Deliberately NOT built: country filter/column (single market — a filter with one value filters
nothing) and the row's `Ver detalle` action (its destination does not exist → a link to a 404).
Also still open: re-enable the LLM judge (quota) · a dedicated BGE-M3 endpoint for prod.

## Resources

- **Pendings + lessons:** `docs/pending/save-fase4-orquestacion-pendientes.md` (F4) and
  `docs/pending/save-orchestration-console-v2-pendientes.md` (console v2 — **state of the branch**)
- **Spec:** vault `Sub-modulo List - Orquestacion Save - SDD Refinado.md` (reconciled 2026-07-19:
  every US carries its real status and **§14 is the live backlog**) + `… Details by Provider …`
- **Composes with:** `cuadra-save-admin` · `cuadra-save` · `cuadra-save-matching` · `cuadra-api` · `cuadra-web`
