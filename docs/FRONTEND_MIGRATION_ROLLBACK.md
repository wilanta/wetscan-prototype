# Frontend Migration Rollback Guide

This branch (`feat/full-frontend-migration`) modifies presentation, CSS, navigation chrome, and route dispatch while keeping all API handlers (`src/app/api/**`), database migrations (`migrations/**`), workers (`worker/**`), auth/session storage (`src/lib/auth/**`), and server authorization checks (`src/proxy.ts`) intact.

## Quick Verification Before Any Rollback Decision

1. Confirm current branch and commit history:
   ```powershell
   git status
   git log -n 5 --oneline
   ```
2. Verify whether an issue is restricted to UI styling or a specific component vs server routes.

## Selective Component Rollback

Because the migration preserved destination API contracts and module isolation, individual visual upgrades can be reverted independently against `origin/master`:

- **Landing page only:**
  ```powershell
  git checkout origin/master -- src/app/page.tsx src/app/layout.tsx
  git rm -rf src/components/landing
  ```
- **AppShell search/switcher chrome:**
  ```powershell
  git checkout origin/master -- src/components/app-shell.tsx
  ```
- **Overview / Projects / Manage views:**
  ```powershell
  git checkout origin/master -- src/components/views/overview.tsx src/components/views/projects.tsx src/components/repository-projects.tsx src/components/views/manage.tsx src/app/app/[...path]/page.tsx
  ```
- **Guard / Sentinel / Canvas visual adjustments:**
  ```powershell
  git checkout origin/master -- src/components/views/guard.tsx src/components/views/sentinel.tsx src/features/guard/live/live-workspace.tsx src/features/canvas/components/graph-node.tsx src/features/canvas/components/inspector.tsx
  ```
- **Global stylesheet tail (`globals.css` lines 4698+):**
  ```powershell
  git checkout origin/master -- src/app/globals.css
  ```

## Full Branch Rollback

To abandon the migration PR cleanly without altering `master`:

```powershell
git checkout master
git branch -D feat/full-frontend-migration
```

If already merged to `master` via PR, revert the merge commit on a dedicated revert branch:

```powershell
git checkout master
git pull --ff-only origin master
git checkout -b revert/frontend-migration
git revert -m 1 <merge-commit-sha>
```

## Database & Operational State Safety

No database schema migrations, `.env*` secrets, or background worker images were changed by this migration. Rolling back code requires zero database downgrade steps.
