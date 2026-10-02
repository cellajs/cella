---
syncBreaking: true
clientCacheBump: false
---

# Database helpers outside auth move to queries and operations

Helpers that read or write the database move to operations or queries. insertMemberships moves
from memberships/helpers/membership-helpers to memberships/operations/insert-memberships;
dispatchDeferredInvites and sendInvitationMails move to memberships/operations; checkSlugAvailable
and checkSlugsAvailable to entities/operations/check-slug; buildPropagationHints to
entities/operations/propagation-hints; the stream session sweep to
entities/operations/stream-session-sweep; recalculateCounters(db) becomes
recalculateCounters(ctx) in entities/counters-queries; sharesOrgFilter moves to user-queries;
withAuditUsers and withAuditUser to user/operations/with-audit-users, taking a DbContext; loadTenant
to tenants/operations/load-tenant. getAttachmentsOp reads through attachment-queries
findAttachmentsPaginated. Apps update imports and calls.

## What & why

`helpers/` holds database-free code only. The flagged helpers outside auth become operations, or move into the module's queries file; operations that read tables inline call queries instead. `get-attachments`, the template `cella/ADD_ENTITY.md` points at, now pairs an operation (read scope) with `findAttachmentsPaginated` (filters, order, paging, total).

## Blast radius

Apps that import these paths, call `recalculateCounters` or `withAuditUsers` with a bare `db`, or copied `get-attachments` for their own entities (their copies keep working). No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. Rewrite imports to the paths in the summary above; `getMembershipEntityIds` and the role resolvers stay in `memberships/helpers/membership-helpers`, the audit-user selections in `user/helpers/audit-user`.
2. `recalculateCounters(db)` → `recalculateCounters({ var: { db } })`.
3. An app entity's list operation may follow the new `get-attachments` split: read scope in the operation, a `find<Name>sPaginated` query for the rest (`cella/ADD_ENTITY.md`).

## Verify

```sh
pnpm check
```
