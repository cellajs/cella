---
breaking: false
clientCacheBump: false
---

# Response descriptions are short labels

A route response `description` is now a label of a few words, with any longer explanation after a blank line
(`'Nothing created\n\nThis request inserted no row. ...'`). The API reference shows the label on the response row and
the rest when the row opens. An app route whose `json()` or 204 `description` holds a long sentence moves its detail
after a blank line.

## What & why

The responses list showed each description whole on its row, where a long one ran to two or three lines.
The docs parser now splits a description at its first blank line into `description` and `detail`, and the template
routes carry labels of at most about 30 characters.

## Blast radius

Not breaking: a long label still renders, only on one row. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. After `pnpm sdk`, list the app's route response descriptions in `sdk/gen/openapi.json` (under `paths`, not `$ref` responses) longer than about 30 characters or holding a colon.
2. In each route's `<module>-routes.ts`, keep a label of a few words without a colon and move the explanation after `\n\n`.

## Verify

```sh
pnpm sdk
pnpm check
```

By hand: open the API reference, open a rewritten response row and check the detail shows above its body.
