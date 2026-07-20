# Sync hardening: one fetch path, grant-boundary views, offline-write fixes

Follow-up release to [2026-07-sequence-sync](../2026-07-sequence-sync/README.md). Engine-core files (`cdc/`, `backend/src/modules/entities/`, `frontend/src/query/`) arrive byte-identical on pull; this guide lists what forks must touch in THEIR files, ordered by breakage risk.

## Breaking: delta-fetch contract (per product module)

The fork-facing `DeltaFetchFn` changed once, in two ways:

1. **`seqCursor` is bounded-only.** The open-ended single-value form (`seqCursor=51`) is gone from the wire schema (400 on old clients; they ride the documented fallback chain). Every caller now knows its upper bound. Nothing to do in list ops — the schema change ships upstream — but any fork code that built a single-value cursor by hand must switch to `"from,until"`.
2. **`pathPrefix` is a new optional fourth parameter.** Re-touch each delta-fetch registration to forward it to the list op, following the attachment template:

   ```ts
   registerEntityQueryKeys('task', keys, (organizationId, tenantId, seqCursor, pathPrefix) =>
     getTasks({ path: {...}, query: { seqCursor, pathPrefix, limit: String(SYNC_CHUNK_SIZE) } }),
   );
   ```

   Server side, add `pathPrefix` to each product list op the way `get-attachments.ts` does (`pathPrefixFilter` on top of the unchanged permission WHERE).

## Breaking: registration-time key validation

`registerEntityQueryKeys` now THROWS at module load when a hand-rolled key shape violates the `createEntityKeys` contract (org/home ids missing from list keys, id missing from detail keys). Keys built with `createEntityKeys` pass by construction. A fork with hand-rolled keys sees the error on first dev boot — fix the shape, don't catch the throw.

## Removed: `getSyncPriority`

The org-level high/low system is gone; hard-delete and seq-less fallback behavior derives from `getSyncTier` (observed-channel granularity). Fork code importing `getSyncPriority` must switch to `getSyncTier(...).min === 0` ("viewing"). Note the semantic narrowing: "act now" is now the observed CHANNEL, not the whole route org.

## New capability: grant-boundary views need a path resolver

Sub-org precision views derive automatically from memberships, but only when the fork registers a channel-path resolver (the template's only channel is the org, so it registers none):

```ts
import { registerChannelPathResolver } from "~/query/realtime/view-declaration";

// Read `path` off cached channel rows; null = unknown (the org view stays the fallback).
registerChannelPathResolver((channelType, channelId) =>
  findChannelPathInCache(channelType, channelId),
);
```

Without this, everything stays correct but sub-org grants derive no precision views and covering fetches never narrow with `pathPrefix`. With it, staff/member grants produce subtree/self/prefix-set views and busy-org fetches narrow to the covering subtree.

## Behavior changes to verify per fork

- **Membership events route via a per-user stream channel** (`user:{userId}`); a membership in a new org now reaches the user live and triggers a client reconnect. Fork dispatch tests asserting membership delivery must register subscribers on the user channel (see `dispatch-mirror.test.ts`).
- **Subscribe-then-snapshot connect cycle**: SSE opens before catchup; notification buffering drains after. No fork action unless a fork patched `stream-store.ts`.
- **Rate limits**: `syncReadLimiter` ships on the attachment list + unseen counts as the template pattern — attach it to fork product list ops; `streamConnectLimiter` + subscriber caps guard the stream. Tune `MAX_STREAMS_PER_USER` if kiosks/shared accounts are a thing.

## Offline-write fixes (adopt the pattern per product module)

The attachment module is the reference; fork product modules copying its old shape must mirror:

- Squash/coalesce moved into the WRAPPED `mutate()` (before the mutation exists) and only touches PAUSED mutations; merged ops go into the request variables.
- Updates share the create/delete mutation scope (serialized replay).
- Delete cancels paused creates (`removePausedCreates`) and keeps those ids off the wire.
- `stx` is minted in the wrapper and carried in variables (`variables.stx ?? createStxFor*()` fallback in the mutation fn) — replay reuses the original mutationId and HLCs.
- Paused mutations persist per tab (persister-owned; no module action, but drop any leader-gating a fork copied into `shouldDehydrateMutation`).
- Failed blob uploads retry with backoff honoring `localBlobStorage.uploadRetryAttempts` (attachment-specific; forks with their own blob pipelines mirror `isUploadCandidate`).

## Verify after pulling

- `pnpm check` + full suites green under the fork's hierarchy.
- Fork dispatch-mirror tests updated for the user channel.
- A dev boot with each product module loaded (registration validation throws early on bad keys).
- With a resolver registered: catchup requests contain sub-org views for granted channels, and a busy-channel flush logs a `pathPrefix` on the delta fetch.
