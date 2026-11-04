---
breaking: false
clientCacheBump: false
grep: isCascadedDelete, ActivityWithoutId, ActivityFieldsTolerant, SyncTraceContext
---

# CDC activity and permission row declared once

An app that forked `cdc/src/services/transaction-buffer.ts` to cast the activity in `isCascadedDelete` (raak:
`(activity as Partial<ChannelIdColumns>)[idColumn]`) takes the template copy at upgrade: the worker's activity is now
`CdcActivity`, which names every channel id column the hierarchy declares, so the cast is no longer needed. No app
module imports a cdc type, so nothing else moves.

## What & why

`PermissionRowData` (`shared/permissions/permission-row-data`) types a product row's permission fields on both ends of
the CDC socket. `CdcActivity` (`Omit<ActivityModel, 'id'> & ChannelIdColumns`) replaces `ActivityWithoutId`, and the
wire check compares the worker's messages with what the API reads, activity included. The API parses the worker's
health report with `cdcHealthReportSchema`. `ActivityRow` is the `z.infer` of `messageRowSchema`; `SyncTraceContext` is
`TraceContext`.

## Blast radius

Not breaking: a fork that keeps its cast still compiles. raak's fork of `transaction-buffer.ts` is the one app edit.
Worker and API ship together, and the API refuses a product row without its id or organization, which the worker
always sends. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. raak: resolve `cdc/src/services/transaction-buffer.ts` to the template's copy, which drops the `ChannelIdColumns` import, the fork comment and the cast in `isCascadedDelete`.

## Verify

```sh
pnpm check
```
