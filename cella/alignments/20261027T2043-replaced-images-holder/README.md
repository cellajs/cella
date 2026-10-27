---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: releaseReplacedImages, findEntityDescriptionForShare, findYjsDocumentUnderKeyShare
---

# releaseReplacedImages names the holder of the replaced image

`releaseReplacedImages({ owner, before, after })` is now `releaseReplacedImages({ holder, before, after })`. App-owned
update operations that release a channel's replaced image rename the key. Two Yjs queries tests override are renamed:
`findEntityDescriptionForShare` is `findEntityDescription`, `findYjsDocumentUnderKeyShare` is `findYjsDocumentGeneration`.

## What & why

The option names the row whose image is replaced. Since the replaced-image fix, an object stays stored while any row
of that holder still names it, so `owner` (the permission engine's creator relation) was the wrong word. The Yjs
queries are named for what they return.

## Blast radius

Sync-breaking for app-owned callers of `releaseReplacedImages` (typecheck flags each). A forked copy of the relay's
`concurrency.test.ts` that overrides the old query name stops overriding without a type error. No database, lens or
`clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In each app-owned `releaseReplacedImages({ owner: ... })` call, rename `owner` to `holder`.
2. In app-owned tests that override `findEntityDescriptionForShare` or `findYjsDocumentUnderKeyShare`, use the new names.

## Verify

```sh
pnpm check
```
