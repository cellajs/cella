---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: accessibility-conformance.json
---

# The conformance ledger moves to `cella/a11y-ledger.json`

`pnpm cella a11y` reads and writes the ledger at `cella/a11y-ledger.json`, no longer at
`json/accessibility-conformance.json`. Move the app's own ledger there and swap its `ignored` entry in
`cella/cella.config.ts`, so the template's ledger never takes its place.

## What & why

`json/` ships in the backend image, and the ledger is the audit's state, which no service reads. Beside the audit's
adapters in `cella/` it stays out of the image and out of new apps' runtime files.

## Blast radius

Every app with a ledger of its own. No wire, cache or schema change. Without the move the next full audit starts an
empty ledger, and every reviewer's decision stays behind in the old file.

## Run

No script: manual.

## Manual steps

1. Move the app's ledger: `git mv -f json/accessibility-conformance.json cella/a11y-ledger.json`. When the merge already
   deleted the old file, take it from `main`: `git show main:json/accessibility-conformance.json > cella/a11y-ledger.json`.
   An app that never ran the audit deletes the template's `cella/a11y-ledger.json` if the upgrade brought it.
2. In `cella/cella.config.ts`, replace `'json/accessibility-conformance.json'` in `ignored` with `'cella/a11y-ledger.json'`.

## Verify

`pnpm cella a11y report` prints the app's own counts of open and agent-decided criteria.

```sh
pnpm check
```
