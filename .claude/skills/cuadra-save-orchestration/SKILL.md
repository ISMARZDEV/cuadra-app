---
name: cuadra-save-orchestration
description: >-
  The BUILT orchestration console of Save (F4, code-complete except #4.7): the admin surface that
  operates the ingestion pipeline — provider-flows with their policy in DB, run now / retry /
  cancel, cascade outcome metrics, and a DB-driven sensor that makes the admin's cron actually
  rule. Owns the hard-won internals: the port is named by ROLE (`PipelineOrchestrator`) and the
  adapter speaks RAW GraphQL because `dagster` is NOT in the API's deps, the run selector is ASKED
  of the server (hardcoding it never launches anything), Dagster is owner of run STATE while we own
  what a run PRODUCED, `new_canonicals` is DERIVED not stored, and exactly-once comes from
  `RunRequest.run_key` without a cursor. Composes with cuadra-save-admin (the console shell),
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

## Where it lives

| Layer | Path |
|---|---|
| Domain | `contexts/save/domain/entities/{orchestration,orchestration_run}.py` · `domain/ports/orchestrator.py` |
| Application | `contexts/save/application/{orchestration_policies,policy_schedule}.py` |
| Infrastructure | `contexts/save/infrastructure/orchestrator/{dagster_graphql,policy_repository,run_snapshot_repository}.py` |
| API | `api/v1/controllers/admin_orchestration.py` (9 routes, capability `ADMIN_SAVE_ORCHESTRATION_OPS`) |
| Ingestion | `ingestion/save/policy_sensor.py` (+ registered in `ingestion/definitions.py`) |
| Web | `apps/web/src/features/admin/resources/save-orchestration/` · `apps/web/pages/admin/orchestration/` |
| Migrations | `986cfadeb758` (policy+config) · `383f4c14de46` (run correlation) · `d9b8ab9bb88a` (snapshot) |

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

**Built (F4 #4.1-4.6 + #4.2b)** — see the table in `docs/pending/save-fase4-orquestacion-pendientes.md`.
**Open: #4.7** — deep-link run→queue (`?run_id=`), then turning the cascade ON (which has REAL side
effects: it hits the supermarkets' live APIs). The pendientes doc holds the decisions the user must
close before that run.

## Resources

- **Pendings + lessons:** `docs/pending/save-fase4-orquestacion-pendientes.md` (source of truth)
- **Spec:** vault `Sub-modulo List - Orquestacion Save - SDD Refinado.md` + `… Details by Provider …`
  — ⚠️ their "Estado real" sections still describe the pre-R1 world; verify against
  `ingestion/definitions.py`, which is the source of truth for assets/jobs/schedules.
- **Composes with:** `cuadra-save-admin` · `cuadra-save` · `cuadra-save-matching` · `cuadra-api` · `cuadra-web`
