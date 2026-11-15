---
breaking: true
clientCacheBump: false
caughtBy: tests
generate: true
grep: shareLink, og:title, RedirectHandlers, backendUrl
---

# Share links are /{code} and /{code}/{letter}{number}, with a code on every channel

Every channel table gets a `code` column, drawn at insert from the new `channel_codes` registry by the
`assign_channel_code` trigger. Share links read `/{code}` for a channel and `/{code}/{letter}{number}` for a numbered
product in it (`shareLinkPath`, and `shareLink` in `frontend/src/utils/share-link.ts`); Caddy and the Vite proxy send
them to the `links` module under `/api/links`. An app runs `pnpm generate` and declares its previews with
`channelShareLink` or `productShareLink` on `defineBackendModule`.

## What & why

A link built on a slug broke when the slug was renamed; a code never changes and is never handed out again.
`channelColumns` adds `code`, `channel_codes` keeps every code with its tenant and channel, and the `links` module
serves `GET /links/{code}` and `/links/{code}/{key}` with the preview a module declares, rendered by
`linkPreviewPage` behind `shareLinkLimiter`.

## Blast radius

Breaking: `backend/drizzle` is app-owned, and every channel read fails until the app generates the column, which its
tests catch. No cache bump or lens. An app without link previews has nothing else to do.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it adds `channel_codes` and a `code` column per channel table, and the side-effects migration backfills existing rows. No hints or hand-written SQL.
2. Rename any frontend route whose path is a digit and six lowercase letters or digits, optionally followed by `/{letter}{number}`.
3. Declare `channelShareLink` on each module whose channel has a public page, `productShareLink` on each numbered product's, and build links with `shareLink(code, { letter, number })` instead of `${appConfig.backendUrl}/...`.
4. If the app replaced `infra/caddy/Caddyfile`, copy the `@shareLink` handle into it.
5. Give a `code` to channel rows the app mocks without `mockChannelColumns`.

## Verify

```sh
pnpm exec vitest run shared/src/share-link.test.ts infra/tests/unit/caddyfile.test.ts
pnpm --filter backend test tests/channel-share-links.test.ts
pnpm check
```
