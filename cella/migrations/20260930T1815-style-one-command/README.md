# One style command

## What & why

`pnpm style` is the only style entry point, and `pnpm style:audit` adds review markers. The per-check
scripts are removed: `comments:check`, `comments:audit`, `comments:language`, `comments:placement`,
`docs:style`, `docs:style:audit`, `vocabulary:check`, `frontend:style`, `prose:check` and `prose:audit`.
The modules in `shared/scripts/` no longer run on their own, and every finding prints as
`file:line:column [rule] "term": message`. The findings themselves are unchanged.

## Blast radius

Sync-breaking only for an app whose own `package.json` scripts or workflows call the removed scripts or run
`node shared/scripts/check-*.ts` (raak: `prose:check`, `frontend:comments`, `check`). An app that never
changed these scripts is unaffected. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. Replace app-owned scripts that call a removed script or `node shared/scripts/check-*.ts` with `pnpm style`, limited to paths where needed (`pnpm style frontend/src`). raak: delete `prose:check` and `frontend:comments`, and drop `pnpm frontend:style && pnpm frontend:comments` from `check` (its `pnpm lint:fix` runs `pnpm style`).
2. An app-owned workflow step that runs `pnpm prose:check` runs `pnpm style`.

## Verify

```sh
pnpm style
pnpm check
```
