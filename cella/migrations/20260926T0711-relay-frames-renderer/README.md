# The relay survives unreadable frames and bounds presence; one bad document never blanks the rest

## What & why

A frame the relay cannot read closes only its own socket with 4400, and a relay failure closes it with 1011. A socket
holds at most four awareness clients. A session cleanup never reaches a newer session of the same document. The editor
stops only after five different refused tokens. The relay and CDC query loggers print queries in development only. The
static renderer drops block types outside the editor schema, and one document that fails never fails the others.

## Blast radius

Breaking only for apps that edited these files: `claimAwarenessClient`, `refuseFrame` (was `refuseMalformed`),
`queryLoggerEnabled` (now in `#/db/create-connection`) and the renderer's `renderableBlocks`. No database change and no
new env vars.

## Run

No script: manual.

## Manual steps

1. Import `queryLoggerEnabled` from `#/db/create-connection` in app worker pools.
2. Custom Yjs clients treat close code 1011 as transient and 4400 as final.

## Verify

```sh
pnpm vitest run --project=yjs yjs/src/tests/relay.test.ts yjs/src/tests/upgrade-join.test.ts yjs/src/tests/session-manager.test.ts yjs/src/tests/db-logger.test.ts
pnpm check
```
