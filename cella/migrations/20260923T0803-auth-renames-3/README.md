# Auth substrate renames, round 3

## What & why

Three renames from the auth substrate naming rounds. `MissingScopeError` / `missing_scope` (the engine's error when an
ancestor channel id is absent, HTTP 400) become `MissingAncestorError` / `missing_ancestor`, so they no longer share a
word with the OAuth face's RFC 6750 `insufficient_scope` (403). Tenant restriction `allowConsentedClients` becomes
`allowUnregisteredClients` (it gates consent to OAuth clients with no registration), refusal `clients_not_allowed`
becomes `unregistered_clients_not_allowed`. Env `MCP_API_URL` becomes `MCP_URL`, matching `mcpUrl` and the other
public URL variables. Plan: `.todos/AUTH_RENAMES_PLAN.md` in cella.

## Blast radius

Sync-breaking for app code that catches `MissingScopeError`, reads `allowConsentedClients` or sets `MCP_API_URL` in a
deploy env. Database: one migration rewrites the `tenants.restrictions` default and the key in stored rows. Wire: the
Tenant response changes, so `clientCacheVersion` bumps (`v9-tenant-restrictions`); keep the bump after sync. Apps that
never touched these areas need only the codemod and the regeneration below.

## Run

```sh
pnpm exec tsx cella/migrations/20260923T0803-auth-renames-3/auth-renames-3.ts inventory backend/src shared/src frontend/src yjs/src locales infra/config   # report only
pnpm exec tsx cella/migrations/20260923T0803-auth-renames-3/auth-renames-3.ts rewrite   backend/src shared/src frontend/src yjs/src locales infra/config   # apply
```

## Manual steps

1. `shared/src/permissions/missing-scope-error.ts` is now `missing-ancestor-error.ts`; the sync renames the template file, the codemod rewrites any app import of it.
2. `backend/drizzle` is app-owned (the default sync config ignores it), so the template migration `20260923075927_unregistered_clients` does not arrive: run `pnpm generate` for the new `tenants.restrictions` default, then append the backfill from the template's `migration.sql` to yours: `UPDATE "tenants" SET "restrictions" = (("restrictions"::jsonb - 'allowConsentedClients') || jsonb_build_object('allowUnregisteredClients', COALESCE(("restrictions"->>'allowConsentedClients')::boolean, true)))::json WHERE ("restrictions"::jsonb) ? 'allowConsentedClients';`. If your app added its own keys to `tenants.restrictions`, that statement keeps them: it only removes `allowConsentedClients` and adds `allowUnregisteredClients`.
3. A deploy environment or `.env` that set `MCP_API_URL` by hand: rename it; the registry binds `MCP_URL` to the worker's own URL, so most apps set nothing.
4. Locale copy: `oauth_refusal.unregistered_clients_not_allowed` in your `app.json` overrides, if any; the template text now says an admin has not installed the app.
4. Keep `clientCacheVersion: 'v9-tenant-restrictions'` (or a later value of your own); the synced bump is what clears cached Tenant rows on every client.

## Verify

```sh
pnpm sdk
pnpm --filter infra compose:generate
pnpm check
```
