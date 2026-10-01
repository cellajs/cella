# Follow-up fixes: comment email switch, table export, notification links

## What & why

Fixes from the tier 2 follow-ups and the 2026-09-30 app syncs. `has.commentEmail` gates the comment email
switch in account settings. Table exports follow `hidden` and take a column's `exportValue(row)`
(`exportDate` formats dates); nothing guesses dates any more. Notification links carry `contextId`.
`createBaseApp` builds a server app, and the folded MCP worker serves its own. `changeArbitraryQueryData`,
`isArbitraryQueryData`, `ArbitraryEntityQueryData` and `EntityIdAndType` are removed. Stories render with
Tailwind.

## Blast radius

Sync-breaking: every app adds `has.commentEmail`, since `shared/config` never syncs. App tables using
`Export` keep compiling and export raw values until their columns set `exportValue`. Users without a
notification preferences row now get the weekly digest. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. Add `commentEmail: false as boolean,` to `has` in `shared/config/config.default.ts`; `true` shows the "Email me about comments" switch (comment emails: see `20261001T0549-mention-write-and-comment-emails`).
2. Optional: let `notificationSearch` in the pinned `frontend/src/routes-config.tsx` take `contextId: string | null` and open a comment's host (projectcampus already does).
3. App-owned columns that should export formatted values set `exportValue`, e.g. `exportValue: (row) => exportDate(row.createdAt)` from `~/lib/export` (raak: `task/table/tasks-columns.tsx`).
4. raak: take upstream for `service-accounts-schema.ts`, `create-service-account.ts`, `tests/service-accounts.test.ts` and `query/tests/query-client-env.ts`, dropping their `// fork:` markers.
5. projectcampus: take upstream for `shared/src/utils/notification-link.ts`, `fan-out.ts`, `send-instant-emails.ts`, the frontend `notification/notification-link.ts`, `service-accounts-mocks.ts`, `api-keys-card.tsx`, `check-access.test.ts`, `tests/hierarchy-helpers.ts` and `bench/src/seeds/attachment.bench.ts`, dropping their markers.
6. App-owned stories whose play tests passed only unstyled (a hidden-until-hover button, a transition, a hand-written `layoutCss`) wait for the transition or check the resting state.
7. App test companions are named `<source>-app.test.ts`; a ` * fork:` line inside JSDoc now counts as a marker.

## Verify

```sh
pnpm style
pnpm test:storybook
pnpm check
```
