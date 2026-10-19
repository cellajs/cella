---
syncBreaking: true
clientCacheBump: false
---

# Locale keys are flat: a dot is part of the key

The i18next instances (`frontend/src/lib/i18n.ts`, `backend/src/lib/i18n.ts`, `backend/emails/i18n.ts`) and the
frontend's `CustomTypeOptions` set `keySeparator: false`. An app whose `locales/*/app.json` or `appError.json` nests
objects flattens them to dotted keys.

## What & why

From i18next 26.5 a key whose name is also the prefix of other keys (`docs` and `docs.openapi_specification`) types as
`never`, which fails the typecheck where the text is used as a string. Every locale file of the template is flat, so a
dot never meant a path.

## Blast radius

Only an app with nested objects in its own locale files: those texts stop resolving. No database change, no cache
change.

## Run

No script: manual.

## Manual steps

1. Search `locales/*/app.json` and `locales/*/appError.json` for an object value; rewrite `{ "a": { "b": "Text" } }` as `{ "a.b": "Text" }`.

## Verify

```sh
pnpm check
```
