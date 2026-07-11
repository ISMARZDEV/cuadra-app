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
7. **NEVER delete REMOTE branches.** After a merge, delete ONLY the local branch (`git branch -d`).
   Do NOT pass `--delete-branch` to `gh pr merge`, and do NOT run `git push origin --delete`. The
   remote branch stays on GitHub (history/reference); only the local copy is cleaned up.
8. **NEVER commit, push, or open a PR mid-flight without the user explicitly asking in the
   CURRENT turn.** "Tests green" or a finished batch is NOT permission — the user repeatedly had
   to say "no hagas commits si no te indico" / "no pushees" (2026-07-09 friction audit). Finish,
   report, and wait for the instruction.
9. **Never make the user babysit CI.** After opening a PR, run `gh pr checks <n> --watch` as a
   background task with a completion notification — the user should be TOLD when it's green, not
   have to ask "¿ya pasó?".

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
6. **Merge** with the chosen strategy, then clean up the LOCAL branch only (the remote branch stays
   on GitHub — never `--delete-branch`):
   ```bash
   gh pr merge <number> --squash    # or --rebase  — do NOT pass --delete-branch
   git checkout developer && git pull origin developer
   git branch -d <branch>           # delete the LOCAL branch only; origin/<branch> remains
   ```

## C. Release developer → main (ONLY when the user says so)

Do NOT do this proactively — wait for an explicit instruction ("merge a main", "release", etc.).

1. Confirm with the user this is a production release.
2. Open the PR: `gh pr create --base main --head developer --title "release: <summary>" --body "..."`.
3. **Verify CI green**: `gh pr checks <number> --watch` — STOP if red/pending.
4. **ASK squash vs rebase** (`AskUserQuestion`). Still ask every time — but know that **`--rebase`
   only works ONCE**: GitHub's rebase-merge rewrites the commits it applies to `main` with NEW
   hashes. From then on, `developer`'s own commit objects (old hashes) and `main`'s (new hashes)
   never match again for the same content, so the NEXT `developer → main` rebase-merge fails with
   `GraphQL: This branch can't be rebased`. Confirmed in practice (cuadra-app PR #6, right after
   PR #4 was rebase-merged). If that happens, tell the user and fall back to **squash** — don't
   just retry rebase. Given this, **squash is the practical default for this repo's releases**
   going forward; only use rebase/merge-commit if the user explicitly wants preserved history and
   this is the FIRST release ever (nothing to diverge from yet).
5. Merge: `gh pr merge <number> --squash` (or `--rebase`/`--merge` per the user's choice). Then
   sync local: `git checkout main && git pull origin main && git checkout developer && git pull
   origin developer`. Do NOT assume `git merge --ff-only main` into `developer` will work after a
   rebase-merge release — it won't (diverged history, same reason as above); a plain `git pull` on
   each branch is enough, they don't need to be literally fast-forwardable from one another.
6. **Realign `developer` onto `main` right after EVERY release, regardless of merge strategy.**
   Squash has the SAME divergence problem as rebase — it also creates a new commit hash on `main`
   that doesn't match `developer`'s. Left unfixed across releases, this compounds: eventually
   GitHub computes an absurd PR diff for the NEXT `developer → main` PR (every historical commit,
   even ones long since released) and may not even trigger CI on it — happened for real (PR #8,
   closed instead of merged). The fix, safe because `main`'s tree and `developer`'s tree are
   content-identical right after a release (verify with `git diff origin/developer HEAD --stat` —
   must be EMPTY before pushing):
   ```bash
   git fetch origin main developer
   git checkout -B developer origin/main
   # cherry-pick anything that landed on developer but not yet in this release (rare — usually none)
   git diff origin/developer HEAD --stat   # MUST be empty — if not, STOP, don't force-push
   git push --force-with-lease origin developer
   ```
   `--force-with-lease` (not plain `--force`) — it refuses if `origin/developer` moved since your
   last fetch, so it can't silently clobber someone else's push. This rewrites a SHARED branch's
   history, so treat it with the same care as any other force-push: confirm with the user first.

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
| Branch cleanup after merge | Delete LOCAL only (`git branch -d`). NEVER delete the remote branch |

## Related skills

- Global `pull-request-dev` / `pull-request-main` cover PR creation for OTHER projects
  (fiscal-contable, bridgeclaw). THIS skill is the cuadra-app-specific flow and adds the CI gate +
  the squash/rebase question. Prefer this one inside cuadra-app.
