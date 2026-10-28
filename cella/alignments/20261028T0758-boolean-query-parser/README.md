---
syncBreaking: true
clientCacheBump: true
caughtBy: compiler
---

# One boolean query parser

`excludeArchivedQuerySchema` is gone from `#/schemas`: a boolean query parameter reads through `booleanTransformSchema`,
which takes `'true'`, `'false'` or a boolean and reads an absent value as false. App schemas that import
`excludeArchivedQuerySchema` switch to `booleanTransformSchema`.

## What & why

Two parsers took the same strings; only `booleanTransformSchema` also takes the JSON boolean the SDK and MCP tools send
(`slug: true`). `excludeArchived` now reads `anyOf` of the string enum and a boolean with default `'false'`, as every
other boolean query parameter does.

## Blast radius

App schemas that import `excludeArchivedQuerySchema`. On the wire no input changes its answer. The spec of
`excludeArchived` changes, which counts as breaking: covered by the `v24-public-counts` bump of the public counts
alignment. Known sites: raak `project/project-schema.ts`, `workspace/workspace-schema.ts`; projectcampus
`course/course-schema.ts`, `course-section/course-section-schema.ts`, `project/project-schema.ts` (all under
`backend/src/modules`).

## Run

No script: manual.

## Manual steps

1. Replace `excludeArchivedQuerySchema` with `booleanTransformSchema` in each app schema that imports it.
2. Run `pnpm sdk`: the SDK type of `excludeArchived` widens to `'true' | 'false' | boolean`.

## Verify

```sh
pnpm check
```
