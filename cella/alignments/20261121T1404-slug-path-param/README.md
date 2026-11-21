---
breaking: false
clientCacheBump: false
grep: slugIncludeQuerySchema
---

# A read by slug takes a slug of any valid length

An app's own route that takes `?slug=true` types the path parameter that holds the id or the slug as
`validIdOrSlugSchema`, where it used `validIdSchema`.

## What & why

A path parameter that may hold a slug was `validIdSchema`, capped at an id's 50 characters, while a slug may hold 255.
`getOrganization` and `getUser` answered 400 `form.too_big` for a longer slug, and the page of that organization or
user did not open. Both now type the parameter `validIdOrSlugSchema` from `#/schemas`.

## Blast radius

Apps with by-slug routes of their own, copied from `getOrganization`. Not breaking: an unaligned route keeps refusing a
slug over 50 characters. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In each app-owned route whose query is `slugIncludeQuerySchema`, type the path parameter that holds the id or the slug `validIdOrSlugSchema`, such as `<params>.extend({ workspaceId: validIdOrSlugSchema })`.
2. Run `pnpm sdk`: that parameter's `maxLength` in the spec goes from 50 to 255.

## Verify

```sh
pnpm check
```
