---
syncBreaking: true
clientCacheBump: false
caughtBy: nothing
grep: membership: 1, counts.membership
---

# Versioned signals count under s: keys

The CDC worker moves the version of each versioned signal as `s:<type>` on the organization's `channel_counters` row,
for every change of a table `versionedSignals` (`backend/src/modules/entities/stream/versioned-signals.ts`) names.
The key `membership` is now `s:membership.changed`, and the API sends `membership.changed` live to the organization's
readers through `toReaders`.

## What & why

Catchup compared one hard-coded counter, `membership`, to tell a client its member lists changed. Any tracked table can
now carry versioned signals, and the readers who are online hear of the change at once: member and invitation lists
(`invalidateMemberQueries` now covers both) refresh without a reconnect.

## Blast radius

App code or SQL that reads the `membership` key of `channel_counters`. Existing rows keep that key, which nothing reads
or repairs any more; the new key starts at the next membership change. No migration, lens or `clientCacheVersion`.

## Run

No script: manual.

## Manual steps

1. Read `s:membership.changed` where app code or SQL read the `membership` key of a counter row.
2. An app table whose changes clients must not miss: add it to `versionedSignals` with its signal types, declare each type with the `readers` audience in its backend module, and handle it in its frontend module.
3. Optional: drop the inert key with `UPDATE channel_counters SET counts = counts - 'membership' WHERE counts ? 'membership';`.

## Verify

```sh
pnpm check
```

Then change a member's role in one browser while another member has the organization's member list open: the list
updates without a reload.
