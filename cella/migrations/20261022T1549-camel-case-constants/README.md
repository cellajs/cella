---
syncBreaking: true
clientCacheBump: false
roots: backend/src, backend/scripts, backend/tests, frontend/src, shared/src, cdc/src, yjs/src, bench/src
---

# Module constants are camelCase

The template's module constants are camelCase now, so app code that imports one under its old SCREAMING_CASE name
stops compiling: `COALESCED` is `coalescedResult`, `PANEL_MIN_WIDTH` and `COLLAPSED_PANEL_MIN_WIDTH` are
`panelMinWidth` and `collapsedPanelMinWidth`, `TITLE_MAX_LENGTH` is `titleMaxLength`, `MOCK_REF_DATE` and
`SCRIPT_UUID_PREFIX` (from `#/mocks`) are `mockRefDate` and `scriptUuidPrefix`. The codemod rewrites every import of
the 67 exported names listed in `renames.json`.

## What & why

`cella/AGENTS.md` asks for camelCase constants; the template had about 430 SCREAMING_CASE ones across `frontend/src`,
`backend/src`, `shared/src`, `cdc/src`, `yjs/src` and `sdk/src`. All are renamed with the same words, except a few that
now say what they hold (`COALESCED` -> `coalescedResult`, `LIMIT` -> `requestLimit`). Values, env variable names,
string literals and protocol keys such as DOMPurify's `ALLOWED_URI_REGEXP` stay.

## Blast radius

Sync-breaking only for app-owned files that import a renamed export, or mock its module with the old key. Synced files
arrive renamed. No database, wire or cache change. An app's own SCREAMING_CASE constants keep working; rename them with
`--extra-renames` if wanted.

## Run

```sh
pnpm exec tsx cella/migrations/20261022T1549-camel-case-constants/rename-constants.ts inventory backend/src backend/scripts backend/tests frontend/src shared/src cdc/src yjs/src bench/src   # report only
pnpm exec tsx cella/migrations/20261022T1549-camel-case-constants/rename-constants.ts rewrite   backend/src backend/scripts backend/tests frontend/src shared/src cdc/src yjs/src bench/src   # apply
```

## Manual steps

1. A comment or doc in app code that names an old constant keeps the old name: search for the keys of `renames.json` and reword by hand.
2. An app that imports one of these constants through `import * as` reads it as `ns.OLD`: rename that access by hand.

## Verify

```sh
pnpm check
pnpm unused
```
