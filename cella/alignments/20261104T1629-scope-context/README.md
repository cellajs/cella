---
breaking: false
clientCacheBump: false
grep: as ActorContext
---

# Request-scope helpers take a ScopeContext

`ScopeContext`, the tenant and organization ids the guard chain set without an actor, is exported from `#/core/context`.
`requestScope` and `requestScopeWhere` take it, and `getValidChannel` takes `DbContext & ScopeContext & AccessContext`.
Every app call compiles unchanged. An app that casts a hand-built context `as ActorContext` only to reach these helpers
may type its own functions on the narrower context and drop the cast; for raak those are the public task and project reads.

## What & why

`requestScope` and `requestScopeWhere` read only `tenantId` and `organizationId`, and `getValidChannel` reads those, the
connection and an optional actor, yet all three asked for an `ActorContext`, so a public read with no actor had to cast.
`ScopeContext` moves from `get-valid-channel.ts` to `core/context.ts`. `accessFrom` returns `Access<ActorBinding>`,
`BindingOf` is gone, and `getValidChannel` keeps one type parameter.

## Blast radius

Not breaking: `ActorContext`, `OrgContext` and `UserContext` stay assignable to the narrower parameters, so no app call
changes. An app that imported `BindingOf` or passed `getValidChannel` two type arguments drops them. No database, lens
or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. raak: in `task/task-queries.ts`, type `findProjectMembers`, `findLabelsByProjects` and `findTaskRelations` on `DbContext & ScopeContext`, and `getTaskRelations` (`task/operations/get-task-relations.ts`) and `listTasks` (`task/operations/list-tasks.ts`) the same.
2. raak: in `task/operations/public-read-context.ts`, build the context with `satisfies DbContext & ScopeContext` in place of `as ActorContext`, and rewrite the comment that explains the cast.
3. raak: type `getPublicProjectOp` (`project/operations/get-public-project.ts`) on `DbContext & ScopeContext & AccessContext`, `AccessContext` from `#/permissions/access`: `publicGuard` sets no actor or tenant.
4. Any other app function typed `ActorContext` only to call `requestScope`, `requestScopeWhere` or `getValidChannel` may take the narrower context the same way.

## Verify

```sh
pnpm check
```

By hand in raak: a public project by slug still answers 404 when the project is not public, and a public task read returns its relations.
