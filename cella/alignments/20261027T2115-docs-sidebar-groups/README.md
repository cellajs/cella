---
syncBreaking: true
clientCacheBump: false
caughtBy: nothing
grep: docs/page/architecture/, docs/page/guides/releases, docs/page/guides/deployment
---

# Docs pages move into sidebar groups

An app that keeps template docs wrappers in `frontend/src/content/docs` moves them to the folders the synced
`repoDocRoutes` map now names: `sync-engine/`, `security/`, `interoperability/` and `operations/`, with
`architecture/index.mdx` becoming `architecture.mdx`. App links to `/docs/page/architecture/<page>`,
`/docs/page/guides/releases` or `/docs/page/guides/deployment` take the new paths.

## What & why

The docs sidebar listed 13 pages under Architecture. They now sit in four top-level groups (Sync engine, Security,
Interoperability, Operations), each with room to nest; Architecture keeps its overview page. `repoDocRoutes` in
`frontend/vite.config.ts` maps every imported repo doc to its new route, so a cross-link in an app whose wrappers
stay at the old paths points to a page the app does not have.

## Blast radius

Apps that keep template wrappers under `architecture/` or `guides/`. `frontend/src/content` is app-owned, so the
moves never arrive by sync and nothing fails: links between docs pages 404. An app without these wrappers is
unaffected. No database, lens or cache change.

## Run

No script: manual.

## Manual steps

1. In `frontend/src/content/docs`, run the moves below for each wrapper the app keeps and skip the ones it removed.
2. In `architecture.mdx`, drop one `../` from the import path: the file moved up a folder.
3. Copy upstream's `security/index.mdx` and `operations/index.mdx` when the app keeps a page in that group.
4. Point app links to the old `/docs/page/` paths at the new ones.

```sh
mkdir -p sync-engine security interoperability operations
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
git mv guides/releases.mdx operations/releases.mdx
git mv guides/deployment.mdx operations/deployment.mdx
git mv architecture/observability.mdx operations/observability.mdx
git mv architecture/jobs.mdx operations/jobs.mdx
```

## Verify

```sh
pnpm --filter frontend exec vitest run src/content/docs
pnpm check
```

Then open `/docs/page/architecture` and follow its links to the pages the app keeps: each opens a page, not a 404.
