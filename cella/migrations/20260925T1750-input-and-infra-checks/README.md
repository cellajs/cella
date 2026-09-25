# Stricter URL, redirect and email checks; infra helpers moved

## What & why

Avatar, banner and logo URLs must sit on the configured CDN origin exactly (`isOriginIn` in `shared/src/utils/url-origin.ts`). Redirect paths are validated after normalizing (`toSafeRedirectPath`). Email interpolations are HTML-escaped, with a `plainText` option for text parts. `StaticDocumentBody`, `BlockNoteMinimalHtml` and `sanitizeUrl` are removed. Infra: `db-exposure-acl` moved to `infra/lib`, `parseBootPlanJson` takes the plan path, and in-process tasks throw `ExitCodeError`.

## Blast radius

Sync-breaking for email templates that pass markup as a value, imports of the removed exports or moved infra helpers, and proxies that rewrite `/internal/cdc`. Stored profile URLs off the CDN origin stay until edited. No database change.

## Run

No script: manual.

## Manual steps

1. Email templates: keep markup in the translation string and spread `plainText` on text outputs.
2. Replace imports of `StaticDocumentBody`, `BlockNoteMinimalHtml` and `sanitizeUrl`.
3. Infra: import `db-exposure-acl` from `infra/lib`, pass the plan path to `parseBootPlanJson`, and throw from tasks.
4. Apps with channels below the organization: backfill `channel_counters.path` once from each channel table's `path`.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm check
```
