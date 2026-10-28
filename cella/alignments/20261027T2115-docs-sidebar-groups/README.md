---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: docs/page/architecture/, DEPLOYMENT.md#, AUTHENTICATION.md#
---

# Docs pages move into sidebar groups

An app that keeps template docs wrappers in `frontend/src/content/docs` moves them where the template
`repoDocRoutes` map now points: from `architecture/` into `sync-engine/`, `security/` and `interoperability/` or up
to the top level, and Authentication and Deployment into folders that hold their new child pages. App links to
`/docs/page/architecture/<page>`, or to sections that left `cella/DEPLOYMENT.md` or `cella/AUTHENTICATION.md`, take
the new paths.

## What & why

The docs sidebar listed 13 pages under Architecture. They now sit in three top-level groups (Sync engine, Security,
Interoperability) beside Observability and Jobs worker; Architecture keeps its overview. Deployment splits into
`cella/deployment/` pages plus the Infra CLI README, Authentication into `cella/authentication/` pages. `repoDocRoutes`
in `frontend/vite.config.ts` maps every imported doc to its route, so an app whose wrappers stay put links to pages it
does not have.

## Blast radius

Apps that keep template wrappers under `architecture/`, or `guides/deployment.mdx`. `frontend/src/content` is
app-owned, so the moves never arrive by upgrade and nothing fails: links between docs pages 404. An app without these
wrappers is unaffected. No database, lens or cache change.

## Run

No script: manual.

## Manual steps

1. In `frontend/src/content/docs`, run the moves below for each wrapper the app keeps and skip the ones it removed.
2. In `architecture.mdx`, `observability.mdx` and `jobs.mdx`, drop one `../` from the import path: they moved up a folder.
3. In `security/authentication/index.mdx` and `guides/deployment/index.mdx`, add one `../`: they moved down a folder.
4. Copy upstream's `security/index.mdx`, and the child wrappers in `security/authentication/` and `guides/deployment/`, for each page the app keeps.
5. Point app links to the old `/docs/page/architecture/` paths, and to moved sections of the two documents, at the new ones.

```sh
mkdir -p sync-engine security/authentication interoperability guides/deployment
git mv architecture/index.mdx architecture.mdx
git mv architecture/sync-engine.mdx sync-engine/index.mdx
git mv architecture/client.mdx sync-engine/client.mdx
git mv architecture/cdc.mdx sync-engine/cdc.mdx
git mv architecture/yjs.mdx sync-engine/yjs.mdx
git mv architecture/schema-evolution.mdx sync-engine/schema-evolution.mdx
git mv architecture/authentication.mdx security/authentication/index.mdx
git mv architecture/permissions.mdx security/permissions.mdx
git mv architecture/multi_tenancy.mdx security/multi-tenancy.mdx
git mv architecture/interoperability.mdx interoperability/index.mdx
git mv architecture/oauth.mdx interoperability/oauth.mdx
git mv architecture/mcp.mdx interoperability/mcp.mdx
git mv architecture/observability.mdx observability.mdx
git mv architecture/jobs.mdx jobs.mdx
git mv guides/deployment.mdx guides/deployment/index.mdx
```

## Verify

```sh
pnpm --filter frontend exec vitest run src/content/docs
pnpm check
```

Then open `/docs/page/architecture` and `/docs/page/guides/deployment` and follow their links to the pages the app keeps: each opens a page, not a 404.
