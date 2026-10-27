---
syncBreaking: true
clientCacheBump: false
caughtBy: nothing
grep: docs/page/architecture/
---

# Docs pages move into sidebar groups

An app that keeps template docs wrappers under `frontend/src/content/docs/architecture/` moves them where the
synced `repoDocRoutes` map now points: into `sync-engine/`, `security/` and `interoperability/`, or up to the top
level (`architecture.mdx`, `observability.mdx`, `jobs.mdx`). App links to `/docs/page/architecture/<page>` take
the new paths.

## What & why

The docs sidebar listed 13 pages under Architecture. They now sit in three top-level groups (Sync engine, Security,
Interoperability), each with room to nest, beside Observability and Jobs worker as top-level pages; Architecture
keeps its overview page. `repoDocRoutes` in `frontend/vite.config.ts` maps every imported repo doc to its new route,
so a cross-link in an app whose wrappers stay at the old paths points to a page the app does not have.

## Blast radius

Apps that keep template wrappers under `architecture/`. `frontend/src/content` is app-owned, so the moves never
arrive by sync and nothing fails: links between docs pages 404. An app without these wrappers is unaffected. No
database, lens or cache change.

## Run

No script: manual.

## Manual steps

1. In `frontend/src/content/docs`, run the moves below for each wrapper the app keeps and skip the ones it removed.
2. In `architecture.mdx`, `observability.mdx` and `jobs.mdx`, drop one `../` from the import path: they moved up a folder.
3. Copy upstream's `security/index.mdx` when the app keeps a page in that group.
4. Point app links to the old `/docs/page/architecture/` paths at the new ones.

```sh
mkdir -p sync-engine security interoperability
git mv architecture/index.mdx architecture.mdx
git mv architecture/sync-engine.mdx sync-engine/index.mdx
git mv architecture/client.mdx sync-engine/client.mdx
git mv architecture/cdc.mdx sync-engine/cdc.mdx
git mv architecture/yjs.mdx sync-engine/yjs.mdx
git mv architecture/schema-evolution.mdx sync-engine/schema-evolution.mdx
git mv architecture/authentication.mdx security/authentication.mdx
git mv architecture/permissions.mdx security/permissions.mdx
git mv architecture/multi_tenancy.mdx security/multi-tenancy.mdx
git mv architecture/interoperability.mdx interoperability/index.mdx
git mv architecture/oauth.mdx interoperability/oauth.mdx
git mv architecture/mcp.mdx interoperability/mcp.mdx
git mv architecture/observability.mdx observability.mdx
git mv architecture/jobs.mdx jobs.mdx
```

## Verify

```sh
pnpm --filter frontend exec vitest run src/content/docs
pnpm check
```

Then open `/docs/page/architecture` and follow its links to the pages the app keeps: each opens a page, not a 404.
