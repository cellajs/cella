---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: fileUploadLimit, defaultBodyLimit, multipart/form-data, dynamicBodyLimit
---

# One request body limit for every content type

An app removes `fileUploadLimit` and `defaultBodyLimit` from its `shared/config/*.ts`: `jsonBodyLimit` (1 MiB) now caps
every request body, whatever its Content-Type. An app-owned route that reads a form or a multipart body larger than
that now answers 413 before it runs.

## What & why

`dynamicBodyLimit` (`backend/src/middlewares/body-limit.ts`) picked the cap by substring: a Content-Type naming
`multipart/form-data` got `fileUploadLimit` (20 MiB), and the JSON validator parses any `+json` type, so a crafted type
gave every JSON route, sign-in routes included, a 20 MiB parse. No template route takes a form, and uploads go to
Transloadit, so one cap applies. The OAuth consent routes mount the limit too.

## Blast radius

Every app's config: typecheck rejects either key. No database, lens or cache change. An app that never set the keys
and serves no form route is otherwise unaffected.

## Run

No script: manual.

## Manual steps

1. Delete `fileUploadLimit` and `defaultBodyLimit` from each `shared/config/*.ts` the typecheck names.
2. An app route that reads a form or file body over 1 MiB sends the file straight to object storage, as the template's uploads go to Transloadit: the limit runs on every path before any route.

## Verify

```sh
pnpm check
```
