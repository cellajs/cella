---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# Apps add blocks and service worker routes through three hook files

Keep `shared/src/app/blocknote.ts`, `frontend/src/blocknote-config.tsx` and `frontend/src/sw-config.ts`, the three files template code now reads, and declare `shareTarget` in `shared/config/config.default.ts`.

## What & why

The BlockNote schema, the text and attachment derivation, the slash menu and the service worker now read app hooks: `appBlockConfigs`, `appMediaBlockTypes`, `appMediaContentType`, `appBlockAttachmentIds`, `appBlockSpecs`, `appTypeToKeys` and `registerAppRoutes`. An app adds its own block or route there without editing template files. An optional `shareTarget` config key fills the manifest's `share_target`.

## Blast radius

Every app, at typecheck. The default hooks are empty, so an app that adds nothing behaves as before. No cache bump, lens or database change.

## Run

No script: manual.

## Manual steps

1. Copy the three hook files from upstream if the upgrade left them out. They are pinned, so later upstream edits stay out of an app's copy.
2. Add `shareTarget: undefined as RequiredConfig['shareTarget'],` beside `has` in `shared/config/config.default.ts`.

## Verify

```sh
pnpm check
```
