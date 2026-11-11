---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: rejectedIds
---

# A batch response holds its rows in results

`batchResponseSchema` answers `{ results, rejectedIds, rejectionReasons? }` where it answered `{ data, … }`: batch create
and delete, attachment presign, session revoke, system invite and channel archive. The invite-members answer holds its
added memberships in `results` too. An operation that returns such an answer names the rows `results`, and a client
reads `response.results`.

## What & why

A list page holds its rows in `results` (AEP-132), and a batch answer held them in `data`. A client now reads rows the
same way from both. `mockBatchResponse` follows.

## Blast radius

Every app: its own batch operations fail typecheck against the route, and a frontend read of `.data` on a typed SDK
answer fails too. Untyped test reads of `.data` do not. An outside API client that reads `data` breaks.
`clientCacheVersion` moves.

## Run

No script: manual.

## Manual steps

1. In each app operation that returns a batch answer, rename the `data` key to `results`.
2. Replace `.data` on a batch SDK answer with `.results`, and a `Response['data']` type with `Response['results']`.
3. In tests and mocks, a batch answer or mock `{ data: [...], rejectedIds }` becomes `{ results: [...], rejectedIds }`.

## Verify

```sh
pnpm check
```

Then run the app's tests that create or delete in batches.
