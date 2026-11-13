# Failure modes

This document lists what can fail in the sync engine and which level answers it, with the function that gives the answer.

### TL;DR

Every failure on the way from a commit to a client's cache has one answer per level. The core path absorbs it, the mid level repairs it with a catchup or a re-read, and the lost case starts over with a refetch or a rebuild. A row with a second answer at one level is an open finding.

## One answer per level

Each failure has one answer per level:

- **Core:** the normal path, built to absorb the failure.
- **Mid:** recovers when the core cannot. The client runs catchup, the worker reads again.
- **Lost case:** starts over. A client refetches once, the worker rebuilds its books.

A second answer at one level is marked as an open finding to remove. A failure nothing answers says None. A change that adds an answer edits its row in the table below, in the [CDC worker's table](../../cdc/README.md#failure-and-recovery) or in the [notifications table](../../backend/src/modules/notification/README.md#failure-modes).

## What fails

| What fails | Core | Mid | Lost case |
| --- | --- | --- | --- |
| A readable row changes | A `change` frame names it and a range fetch patches the caches (`fetchRangeAndPatch`). The writing tab fetches nothing for its own write (`isOwnEcho`) | | |
| A change commits while catchup reads | The stream opens before catchup and buffers its frames until catchup ends. A full buffer runs catchup once more (`runCatchupCycle`) | | |
| Frames are missed: the stream was down, or the API restarted, lost a frame or closed a client that stopped reading | | Catchup fetches each view's sequence gap (`processStreamCatchup`) | |
| A range fetch fails | Retried with a growing delay (`flushGroup`) | The cursor moves past the range and its lists get a refetch mark (`invalidateUndelivered`) | |
| A range returns fewer rows than announced: a row changed again, became unreadable or left with its channel | | Refetch mark (`invalidateUndelivered`) | |
| Unseen counts miss rows: a range that may hold creates was not delivered whole, or the stream reconnected | | An exact recount, asked for by the undelivered range (`invalidateUndelivered`) and at the end of every catchup (`processStreamCatchup`) | |
| A change has more rows than a frame names | The `change` frame's `overflow` names their sequence range for a create or update. For a delete or a move-out it names their ids up to the id bound (`maxStreamChangeIds`) | Past the id bound a delete or move-out marks the lists, recounts unseen and drops the type's cached details below the old home (`removeEntityDetailsBelow`). The stored files of those rows stay, an open finding | |
| A row moves where a reader cannot read it | One `change` frame with the `moveOut` action per reader for the rows one message moved removes them from the caches and purges their stored files (`removeEntity`, the download purge on sync-events) | | |
| A channel goes private | The same `moveOut`, to the readers who had its rows through their `public` flag alone (`parseUpdate` sets `movedFrom`) | | |
| A row is hard-deleted or unpublished | A `change` frame with the `delete` action marks its detail stale without a refetch, takes it off the unseen counts, marks its lists, refetching those on screen, and applies its propagation hint (`handleProductChange`) | | |
| A channel is deleted and its rows leave by cascade | `channel.deleted` drops what is cached below it (`handleChannelDeleted`) | Missed while away: catchup finds a new signal version and marks the lists (`refetchBelowDeletedChannels`) | |
| A versioned signal is heard live | The frame carries its version. The client records it once its handlers ran, and the next catchup does not run it again (`noteHeardSignal`) | Missed across a stream break, moved by a cascade, sent by a worker of an earlier release, or its handler threw: the catchup runs it once | |
| A frame handler throws, in the leader or a follower | Logged and skipped (`applyChange`, the follower's message handler) | | |
| An embedded row changes while hosts hold copies | The frame's `propagation` hint patches the copies (`propagateEmbeddings`) | Missed while away: the catchup's hints (`buildPropagationHints`). Past a hint's or a frame's cap the host lists refetch (`invalidateEmbeddingHosts`) | |
| A list read overlaps live patches | The canonical read merges the ranges the cursor moved past while it ran (`readAgainstDeltas`) | | |
| A membership changes while the stream connects | The memberships are read again once the stream registers, and a change closes it with `access_changed` (`membershipsChangedSince`) | | |
| A membership changes while the stream is live | The subscriber's memberships update and `membership.changed` tells the user | Missed while away: catchup's signal versions and its read of the memberships, after which it drops the list caches of each organization where a channel membership was lost | |
| A membership is added in an organization the stream never registered on | The user's `membership.changed` reconnects the stream when the sync store lacks the organization, and the new stream registers there (`streamManager.reconnect`) | | |
| A session is revoked | `session.revoked` closes its streams | | |
<<<<<<< HEAD
| A session expires or a system role changes | A recheck each minute closes the stream (`ensureStreamSessionRecheck`) | | |
| The tenant is archived or restored | Its streams close with `access_changed` (`closeOrganizationStreams`) | | |
=======
| A session expires or a system role changes | A sweep each minute closes the stream (`ensureStreamSessionSweep`) | | |
| The tenant is deleted or restored | Its streams close with `access_changed` (`endOrganizationStreams`) | | |
>>>>>>> 213818d5c (refactor!: a deleted organization's tenant has status deleted, and leaving an organization leaves its channels)
| The stream errors, ends or falls silent | The silence watchdog and a reconnect with backoff, at once when the app is back online or a tab takes over (`handleStreamFailure`) | Repeated failures open the circuit, which a passing health check closes. A session or tenant the server refuses opens it until the next sign-in (`openCircuit`) | |
| A request gets no response: the link drops packets, or the tab reloads while it waits | The connectivity probe runs. Once it finds the API unreachable, the app goes offline and a waiting write pauses in the queue (`apiFetch`). A sync write is stored while it runs. A reload sends it again as a replay (`shouldDehydrateMutation`) | | |
| A catchup hangs or fails | Bounded, then the stream's failure path (`handleCatchupFailure`). The writes waiting for it go ahead (`waitForActiveCatchup`) | The same circuit | |
| No CDC worker reads | | `worker_away` pings put synced queries back on a stale time (`setSyncWorkerAway`) | |
| Rows are readable but the summary is unproven (`opaque`) | | Each catchup marks the view's cached lists and refetches those on screen (`processStreamCatchup`). Its hint names the embedded rows changed since the last one, whose hosts refetch (`settleOpaqueHint`) | |
| The leader tab closes | Web Locks hand the stream to another tab, which reconnects (`initTabCoordinator`) | | |
| Web Locks are missing or the election throws | The tab takes the leader role (`initTabCoordinator`) | | |
| A tab comes back from a public page while another tab leads | | | None, an open finding: as a follower it runs no catchup of its own (`connect`). What it missed arrives only when a later frame of the same scope fetches from its cursor |
| Two tabs of one user write the persisted sync store | | | None, an open finding: the last write of the one record per user wins (`syncStore`). One tab's cursors or cleared refetch can overwrite those of a tab that closed before its refetch ran |
| The books get a new generation | | | The API ends every stream with `resync`. Each client resets its cursors and signal versions, runs each versioned signal's handler once and refetches once at its share of a spread (`adoptGeneration`) |
| A device was away longer than the activity window | | | It resets its cursors and refetches at once (`startOverIfAway`) |
| A create or update reaches the API after its row left the table | The API sends no frame for it (`dispatchChange`) | | |
| A frame or signal of a type the bundle does not know | Skipped (`handleStreamChange`, `handleStreamSignal`) | | |
