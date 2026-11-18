---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: cella/ANONYMOUS_SESSIONS.md, cella/ARCHITECTURE.md, cella/AUTHENTICATION.md, cella/CLIENT.md, cella/DEPLOYMENT.md, cella/INTEROPERABILITY.md, cella/JOBS.md, cella/MCP.md, cella/MULTI_TENANCY.md, cella/OAUTH.md, cella/OTEL.md, cella/PERMISSIONS.md, cella/QUICKSTART.md, cella/RELEASES.md, cella/SCHEMA_EVOLUTION.md, cella/SYNC_ENGINE.md, cella/TESTING.md, cella/authentication/, cella/deployment/, cella/sync-engine/, cella/SECURITY.md
---

# The template's docs live in cella/docs/

The template's docs move from `cella/` to `cella/docs/`, and `cella/SECURITY.md` moves to `.github/SECURITY.md`. An app
points its own links and comments at the new paths, and owns `.github/SECURITY.md` with its own contact.

## What & why

In `cella/`, docs sat beside the CLI's config and tool files, and a listing did not tell them apart. All 17 Markdown
docs and the `authentication/`, `deployment/` and `sync-engine/` folders now sit in `cella/docs/`; `AGENTS.md` and
`CHANGELOG.md` stay in `cella/`. GitHub reads a security policy only from the repo root, `.github/` or `docs/`.
`SECURITY.md` therefore moves to `.github/`.

## Blast radius

The upgrade moves the files. App files that link to a doc or name one in a comment keep the old path and need
updating, and the compiler does not catch them. An app that never linked to a template doc only needs the
`SECURITY.md` step.

## Run

No script: manual.

## Manual steps

1. Point each link or comment the `grep` terms find at `cella/docs/`, or at `.github/SECURITY.md` for the security policy.
2. Add `'.github/SECURITY.md'` to `ignored` in `cella/cella.config.ts`, and write the app's own reporting contact in it.

## Verify

```sh
pnpm check
```
