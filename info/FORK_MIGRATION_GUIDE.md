# Fork migration guide

Instructions for AI agents to align a fork with upstream Cella after running `pnpm cella`.

## Context

The sync CLI auto-merges most files. The work is in **pinned** and **ignored** files (see `cella.config.ts`). Pinned files prefer the fork version during conflicts — you must manually compare them with upstream and apply relevant changes. Expect multiple fix rounds; upstream changes cascade through: `DB schema → validation schema → routes → OpenAPI → generated client → queries → forms/UI`.

## Steps

### 1. Identify upstream changes

```bash
# In fork: see what the sync brought in
git log --oneline -5 sync-branch

# In cella: see what changed upstream
git diff COMMIT_HASH..HEAD --name-only
```

Cross-reference changed files against the fork's `cella.config.ts` pinned/ignored lists.

### 2. Review pinned and ignored files

**Pinned files** won't update automatically. Compare each with its upstream version and apply relevant changes:

| Pinned file type | What to look for |
|-----------------|------------------|
| `*-config.ts` files | New properties, changed defaults, new entity registrations. These are pinned/ignored because forks customize them, but upstream often adds new required fields or config options that the fork must also add with its own values. |
| `backend/src/db/schema/*.ts` | New columns, changed types, new indexes. Fork may have extra columns — merge carefully. |
| `backend/src/routes.ts` | New route registrations, changed middleware chains. |
| `backend/src/schemas/*` | Changed validation shapes that pinned route files depend on. |
| `frontend/src/routes/route-tree.tsx` | New routes added upstream that fork may want. |
| `package.json` files | New scripts, changed dependency versions (lockfile is regenerated separately). |

### 3. Apply entity pattern changes

Upstream Cella uses `organization` (context entity) and `attachment` (product entity) as reference implementations. When upstream refactors these patterns, **apply the same refactoring to all equivalent entities in the fork**:

- **Context entity changes** (e.g., upstream changes how `organization` memberships, routes, or schemas work): Apply the same pattern to every context entity in the fork (e.g., raak's `project`).
- **Product entity changes** (e.g., upstream changes how `attachment` CRUD, queries, or sync works): Apply the same pattern to every product entity in the fork (e.g., raak's `task`, `page`, `workspace`).
- **Membership/permission changes**: These often affect all context entities — check `memberships-schema.ts`, `permissions-config.ts`, and related handlers.

### 4. Regenerate and verify

Run iteratively until clean. User is likely to run migration itself.

```bash
pnpm install              # Regenerate lockfile
pnpm generate:openapi     # Regenerate API client
pnpm check                # Typecheck + lint (runs generate:openapi internally)
pnpm build                # CDC, backend, frontend build independently — all must pass
pnpm test                 # Run tests
```

Common type errors: changed schema exports, renamed fields in query responses, mock data shape mismatches in `backend/mocks/`.

## Rules

- **`*-config.ts` files are pinned/ignored but not exempt from review.** Always diff them against upstream. New config properties, entity registrations, or permission definitions must be added to the fork with fork-appropriate values.
- **Entity pattern changes are not one-off.** A refactor to `organization` or `attachment` in upstream is a signal to refactor all equivalent entities in the fork.
- **CDC breaks independently.** It has its own Dockerfile, package.json, and tsup config. Verify separately.
- **Lockfile is always regenerated**, never merged. Run `pnpm install` after any dependency changes.
- **Drizzle migrations may need full refresh.** If schemas changed, delete stale snapshots and run `pnpm generate`.
- **Expect 50-150+ file changes** after a schema refactor. Use descriptive commits (`fix: align schema consumers after sync`) not vague ones (`fixes`).
