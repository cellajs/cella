---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: clientCacheVersion
---

# The client cache version is a number

`appConfig.clientCacheVersion` is a number that only rises: the template's is 46. An app that sets its own string in
`shared/config` replaces it by a number one higher than the template's. A cache an older bundle wrote loses its
queries at boot, and a cache a newer bundle wrote marks the running bundle stale.

## What & why

The cache version was a string compared for equality, while the lens pointer beside it is ordered. A rollback
deploy, or an old tab beside a new one, wiped the newer cache and wrote its own shapes into it. Both versions now
take one ordered branch in `restoreClient`, and the persister stores no TanStack `buster`.

## Blast radius

Every app with its own `clientCacheVersion` in `shared/config`: the compiler refuses a string. Every client wipes its
cached queries once on the deploy, since a stored string counts as older; queued writes stay. CI's
`schema-bust-gate` asks for a higher number.

## Run

No script: manual.

## Manual steps

1. An app that sets its own `clientCacheVersion` string replaces it by a number one higher than the template's (47 for 46).
2. A test that seeds a meta record with a string `clientCacheVersion` or a `buster` seeds a number and drops `buster`.

## Verify

```sh
pnpm check
```
