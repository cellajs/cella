---
syncBreaking: false
clientCacheBump: false
---

# Fixes asked for by raak and projectcampus, and the workarounds they retire

Optional steps, each for an app that has the workaround or copy named. A product module imports its `query.ts` from its
module file; a create schema passes `params: { type: issue.type }` with a placement issue; the Yjs integration tests
home their attachment at the deepest strict ancestor; `benchUuid` is exported; a YAML file takes a `# fork:` marker.

## What & why

- `resolveChannelBySlug` revalidates a detail it seeded from a list row whatever the navigation cause, so a param change
  within a route shows counts too.
- `validatePlacement` answers the types `ambiguous_placement` and `home_required` (`error.json`), also from
  `resolvePlacement`, in place of `invalid_request` and English text.
- The restore warns about a restored mutation without a `mutationFn`.

## Blast radius

No app has to act; each step deletes a copy or a marker. No database change, no cache change.

## Run

No script: manual.

## Manual steps

1. A product module whose mutations queue offline imports its `query.ts` in `<name>-module.ts` (raak: `task-module.ts`, `label-module.tsx`), as `attachment-module.ts` does.
2. Delete a workaround that fetched the counts a seeded channel detail lacked (projectcampus: `channel-tile/fetch-missing-counts.ts` and its calls in three `route-logic.ts`).
3. A create schema that reports a placement issue passes `params: { type: issue.type }` to `ctx.addIssue`; drop app error types for the same two cases from `appError.json` (projectcampus: `ambiguous_placement`, `home_required`).
4. Take upstream's `yjs/src/tests/integration/permissions.test.ts`, `revocation.test.ts` and `outside-write.test.ts` where the app edited them, and drop the `fork:` lines in `entity-grid/stories/channel-tile.stories.tsx`.
5. A bench id helper that copied the uuid format imports `benchUuid` from `bench/src/seeds/ids.ts` (raak: `bench/src/seeds/label-id.ts`).
6. An app edit in a synced YAML file gets a `# fork: <why>` line (raak: the `@babel/traverse` override in `pnpm-workspace.yaml`).

## Verify

```sh
pnpm check
```
