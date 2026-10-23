---
syncBreaking: true
clientCacheBump: false
---

# `lazyNamed` keeps each component's props

`lazyNamed` (`frontend/src/utils/lazy-named.ts`) and `useLazyComponent` type the component they return with the export's
own props. An app-owned file that renders a lazy component with props its component does not take fails `pnpm ts`
until the props or the component's prop type agree (projectcampus: `AboutChannel.can`).

## What & why

`lazyNamed` declared a type parameter that only `TModule`'s constraint named, so TypeScript never inferred it and
every lazy component accepted any props. It now reads `lazyNamed<TModule, TKey>(loader, exportName):
LazyExoticComponent<TModule[TKey]>`, and `useLazyComponent` the same. Calls are unchanged.
`common/form-fields/lazy-blocknote.tsx` keeps one annotated `ComponentType<any>`: `lazy` loses a generic component's
type parameter.

## Blast radius

Types only: no runtime, database or cache change. raak compiles unchanged. projectcampus fails `pnpm ts` in three
app-owned `route-components.tsx` files, all from one cause: `AboutChannel.can` is narrower than the enriched channels
those routes pass to `ChannelAboutPanel`.

## Run

No script: manual.

## Manual steps

1. In `frontend/src/modules/channel-tile/channel-about-panel.tsx` (projectcampus), type `AboutChannel.can` as `can?: EntityCan;` with `import type { EntityCan } from '~/modules/entities/types';`. That clears `course/route-components.tsx:52`, `course-section/route-components.tsx:53` and `project/route-components.tsx:54`.
2. For any other app-owned error at a lazy component, pass the props the component declares, or widen its prop type.

## Verify

```sh
pnpm --filter frontend ts
pnpm check
```
