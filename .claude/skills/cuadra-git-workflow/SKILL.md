---
name: cuadra-git-workflow
description: >
  Cuadra-app branching + integration workflow: main (production) ← developer (integration) ←
  feat/* | fix/* | docs/* | chore/* (work branches). Encodes the rules — never commit directly to
  main/developer, always integrate via PR, CI (.github/workflows/ci.yml) MUST be green before merge,
  and ALWAYS ASK the user squash vs rebase. Merges to main happen ONLY when the user explicitly says so.
  Trigger: Starting a feat/fix branch, integrating work into developer, releasing developer → main,
  or any question about the cuadra-app git/branch/merge/CI flow.
license: Apache-2.0
metadata:
  author: ismartz
  version: "1.0"
---

# Cuadra Git Workflow

The branch model and merge rules for **cuadra-app**. Run every action from the repo root
(`/Users/ismartz/Desktop/DEV/cuadra-app`).

## Branch model

```
main          production. Protected. Only updated by an EXPLICIT user-indicated release.
  ▲ merge (only when the user says so)
developer     integration branch (branched from main). All work lands here first.
  ▲ merge (via PR, after CI green + user picks merge strategy)
feat/<scope>  work branches, branched from developer.
fix/<scope>
docs/<scope>
chore/<scope>
```

## Hard rules (read FIRST)

1. **NEVER commit directly to `main` or `developer`.** Always work on a `feat/ | fix/ | docs/ | chore/`
   branch cut from `developer`.
2. **Always integrate via a PR**, never `git merge` locally into developer/main. CI only runs on
   `pull_request` (and push to `main`) — a local merge would skip the gate. See
   `.github/workflows/ci.yml`.
3. **CI MUST be green before any merge.** Verify with `gh pr checks` (below). Do not merge a PR with
   failing or pending checks.
4. **ALWAYS ASK the user `squash` vs `rebase`** before merging (use `AskUserQuestion`). Never assume.
5. **Merging `developer → main` happens ONLY when the user explicitly indicates it.** Merging
   `feat/fix → developer` is part of the normal flow and does not need a separate go-ahead.
6. **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`). No AI
   attribution / no `Co-Authored-By`.

## A. Start a work branch

```bash
git checkout developer
git pull origin developer          # start from the latest integration state
git checkout -b feat/<scope>       # or fix/ | docs/ | chore/
```

Work, committing with conventional messages. Push on the first commit:

```bash
git push -u origin feat/<scope>
```

## B. Integrate feat/fix → developer

1. **Pre-flight** (stop on any failure):
   - Current branch is NOT `main`/`developer` (`git branch --show-current`).
   - Working tree clean (`git status --short`) — commit everything first.
   - Optionally run the relevant check locally to fail fast:
     `pnpm --filter @cuadra/mobile typecheck` (mobile) / `cd apps/api && uv run ruff check . && uv run pytest -m "not integration"` (backend).
2. **Push** the branch if needed: `git push -u origin <branch>`.
3. **Open / find the PR** to developer:
   ```bash
   gh pr list --base developer --head <branch> --json number,url   # reuse if it exists
   gh pr create --base developer --head <branch> --title "<conventional title>" --body "<summary>"
   ```
4. **Verify CI is green** (the gate):
   ```bash
   gh pr checks <number> --watch        # waits for the run; non-zero exit = failing
   ```
   If anything fails → report it and STOP. Fix on the branch, push, re-check. Do NOT merge red/pending.
5. **ASK the user the merge strategy** (`AskUserQuestion`: `Squash` vs `Rebase`).
6. **Merge** with the chosen strategy, then clean up:
   ```bash
   gh pr merge <number> --squash --delete-branch   # or --rebase --delete-branch
   git checkout developer && git pull origin developer
   ```

## C. Release developer → main (ONLY when the user says so)

Do NOT do this proactively — wait for an explicit instruction ("merge a main", "release", etc.).

1. Confirm with the user this is a production release.
2. Open the PR: `gh pr create --base main --head developer --title "release: <summary>" --body "..."`.
3. **Verify CI green**: `gh pr checks <number> --watch` — STOP if red/pending.
4. **ASK squash vs rebase** (`AskUserQuestion`). For releases, prefer **rebase/merge-commit** over
   squash so developer's history is preserved on main — but still ASK and follow the user.
5. Merge: `gh pr merge <number> --rebase` (or per the user's choice). Then sync local:
   `git checkout main && git pull origin main && git checkout developer && git merge --ff-only main`.

## CI reference (`.github/workflows/ci.yml`)

- Runs on every `pull_request` and on push to `main`.
- `changes` job path-filters: `apps/api/**` → `backend` job; `apps/mobile/**` + `packages/**` → `mobile` job.
- `backend`: `ruff check` → `lint-imports` (hexagonal boundaries) → `pytest` unit → `alembic upgrade` → `pytest` integration (with pgvector DB).
- `mobile`: `pnpm install --frozen-lockfile` → `pnpm --filter @cuadra/mobile typecheck`.
- A PR that touches neither path → no backend/mobile job runs; `gh pr checks` will show no required failing checks (safe to merge).

## Decisions to surface (never silently default)

| Decision | Action |
|---|---|
| Merge strategy (squash/rebase) | ALWAYS `AskUserQuestion` before merging |
| Merge to `main` | Only on EXPLICIT user instruction |
| CI red or pending | STOP, report, do not merge |

## Related skills

- Global `pull-request-dev` / `pull-request-main` cover PR creation for OTHER projects
  (fiscal-contable, bridgeclaw). THIS skill is the cuadra-app-specific flow and adds the CI gate +
  the squash/rebase question. Prefer this one inside cuadra-app.
