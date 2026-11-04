---
breaking: false
clientCacheBump: false
---

# Channel queries annotate the enriched type

The organization queries declare `Promise<EnrichedOrganization>` (and `Promise<QueryData<EnrichedOrganization>>` for a list page) as their return type in place of `as EnrichedOrganization`. An app's own channel queries may drop their `as EnrichedX` the same way; each cast compiles unchanged if kept.

## What & why

`ChannelEnrichment` is all-optional, so every SDK channel row assigns to `X & ChannelEnrichment` and each `as EnrichedX` checks nothing. A return annotation on the `queryFn`, the page fetcher and the placeholder fails to compile when the SDK row drifts from `EnrichedX`; where `useMutation<EnrichedX>` already types the `mutationFn`, the cast just goes.

## Blast radius

Optional, app-owned channel modules only: `organization/query.ts` arrives with the upgrade. Nothing breaks if an app keeps its casts. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. raak `frontend/src/modules/project/query.ts`: the page fetcher in `offsetPaging` returns `Promise<QueryData<EnrichedProject>>` and the detail `queryFn` `Promise<EnrichedProject>`, without their casts.
2. projectcampus `frontend/src/modules/course/query.ts`: `fetchCoursesPage` returns `Promise<QueryData<EnrichedCourse>>`, the detail `queryFn` `Promise<EnrichedCourse>`, and the create `mutationFn` drops `as EnrichedCourse`.
3. projectcampus `frontend/src/modules/course-section/query.ts`: the same with `EnrichedCourseSection`.
4. projectcampus `frontend/src/modules/project/query.ts`: the same with `EnrichedProject`.

## Verify

```sh
pnpm check
```
