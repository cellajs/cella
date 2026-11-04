---
breaking: false
clientCacheBump: false
grep: signal-types, yDocFragment, PropagationHint, tenant_revoked
---

# Shapes both ends read are declared once in shared

Types and constants the API, the client, the relay and the workers each declared now live in shared: `SeqRange` and `severityLevels` (`shared`), `ArrayDelta` and `isArrayDelta` (`shared/utils/array-delta`), the health envelope and `statusRank` (`shared/health-status`, with `FullHealth` in `shared/health-app`), `StreamSignalTypes` (`shared/stream-signal-types`), `ConsentDetails`, `UserGrantRefusal` and `ResourceRef` (`shared/oauth-consent`), `NotificationPushPayload` (`shared/push-payload`), the relay's message types, close codes and `yjsFragmentName` (`shared/utils/yjs-protocol`), `nodeEnvs` (`shared/utils/worker-env`) and `oauthProviders` (`shared/config-builder/types`). An app that adds a stream signal augments `StreamSignalTypes` there. No app edit is needed to compile.

## What & why

Each shape was written twice, held equal by "must match" comments. The paths app modules import keep exporting: `SeqRange` from `#/utils/seq-range` and `~/query/basic/entity-query-registry`, `ArrayDelta` and `isArrayDelta` from both `array-delta` files, the health types from `#/lib/health-helpers`. The stream error payload is the named `StreamError` schema, without `forbidden` and `tenant_revoked`, which nothing sent. `PropagationHint` and `SpanStatus` are gone.

## Blast radius

Not breaking: raak and projectcampus modules import through paths that still export, and template files that read a removed name arrive updated. A template file an app changed fails typecheck where it imports one. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. An app's own stream signal: augment the shared interface with `declare module 'shared/stream-signal-types'`; `~/query/realtime/signal-types` is gone. Neither app declares one today.
2. A changed template file that fails typecheck: import the name from its shared module above. `yDocFragment` is `yjsFragmentName`, and the keys of `yjsMessageTypes` and `yjsCloseCodes` are PascalCase (`Sync`, `TokenInvalid`).

## Verify

```sh
pnpm check
```
