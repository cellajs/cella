---
syncBreaking: true
clientCacheBump: false
---

# Route helpers, overlay and form cleanup, one prose rule table

createXRoutes, xRoute, json and jsonBody shorten route files, and createXRoute adds
errorResponseRefs itself; app route files keep compiling and the OpenAPI document is unchanged. The
overlay stores drop the write-only triggerRefs registry (setTriggerRef is a deprecated no-op; delete
the calls). The stepper keeps only the vertical variant, SelectEmails replaces ui/tag-input and
utils/is-email and accepts a chip exactly when the invite schema does. The prose checks run from one
rule table in one process: agent-vocabulary.ts is removed, VocabularyAllowlist gains proseExclude,
and an app that edited check-comment-style.ts to skip paths moves them there.

## What & why

Repeated patterns collapse into shared pieces. Route files can use `createXRoutes`, `xRoute`, `json` and
`jsonBody` from `backend/src/core/x-routes.ts`, and `createXRoute` adds `errorResponseRefs` itself. The
overlay stores drop the `triggerRefs` registry; `setTriggerRef` stays as a deprecated no-op. The stepper keeps
only its vertical variant, and `SelectEmails` absorbs `ui/tag-input.tsx` and `utils/is-email.ts`. The prose
checks share one rule table: `agent-vocabulary.ts` is gone and `VocabularyAllowlist` gains `proseExclude`.

## Blast radius

Sync-breaking only for an app with a `// fork:` edit in `shared/scripts/check-comment-style.ts`
(projectcampus). App code calling `setTriggerRef` keeps compiling. App-owned route files keep compiling and
produce the same OpenAPI document. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. projectcampus: drop the `// fork:` edit in `shared/scripts/check-comment-style.ts`, add `proseExclude: ['projectcampus-api/', 'projectcampus-web/']` to `shared/config/vocabulary-allowlist.ts`.
2. Delete the `setTriggerRef` calls: raak `task/card/card-header.tsx` and `task/table/tasks-columns.tsx`; projectcampus `comment/comment-list.tsx`, `common/product-author.tsx` and `channel-tile/channel-about-panel.tsx`.
3. Delete leftovers the sync does not remove: `shared/scripts/agent-vocabulary.ts`, `frontend/src/modules/ui/tag-input.tsx`, `frontend/src/utils/is-email.ts`, and in `frontend/src/modules/common/stepper/` the files other than `stepper.tsx`, `use-stepper.ts` and `types.ts`.
4. `frontend/src/modules/common/form-fields/domains.tsx` imports `ui/tag-input`: sync the cella release that deleted it first, or delete it.
5. Optional: convert app-owned `*-routes.ts` to `createXRoutes`, dropping the `...errorResponseRefs` spread, `tags` and any `operationId` equal to its key.

## Verify

```sh
pnpm style
pnpm sdk   # sdk/gen/openapi.json changes only in key order after an optional route conversion
pnpm check
```
