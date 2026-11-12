---
breaking: false
clientCacheBump: false
grep: filterExistingProductIds, stxWithIds, lifecycle: 'owned'
---

# A host write brings back a row the owned lifecycle collected

Nothing to change for an app whose host writes call `filterExistingProductIds` inside their transaction: it now
restores a row the CDC worker soft-deleted when no host named it any more. Check a host write of an `owned` embedding
that filters ids its own way, or stores them unfiltered.

## What & why

With `lifecycle: 'owned'`, removing a file from a document and saving soft-deleted its row, and an undo then named a
row that stayed deleted. The worker's tombstone now carries a `collected` mark in `stx` (`stxCollected`), and
`filterExistingProductIds` restores such a row for a host write, as a create: within the tenant quota, when its
writer may create the row where it lives, and never in an archived channel. A row a person deleted is never restored:
the stx schema of a request body does not hold the mark. The worker's reference cleanup keeps the id of a row that is
live again in its hosts.

## Blast radius

Apps with an `owned` embedding. Not breaking: no schema or cache change. The `stx` of a collected row has one more
key, `collected`, and `cdc` as its source. A tombstone the worker wrote before this change carries no mark and stays
deleted.

## Run

No script: manual.

## Manual steps

1. Call `filterExistingProductIds` inside the host's write transaction (`tenantContext`) in each host write of an owned embedding that should restore: on the bare pool or in a read it restores nothing, and so does a create that stores the ids it derives unfiltered.
2. Store what the filter returns in that same write. A write that filters and then stores nothing, such as an update whose field loses to a newer one, leaves a restored row live with no host, which the worker never collects: filter after the write is known to store the ids.

## Verify

```sh
pnpm check
```

Then, in a document of a host with an owned embedding: remove a file, wait for the save, undo, wait for the save and
reload. The file shows, and its row is live.
