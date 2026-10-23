---
syncBreaking: true
clientCacheBump: false
---

# AttachmentsCarousel takes `containerClassName`

`AttachmentsCarousel`'s class prop for each slide's container is named `containerClassName`, as on `AttachmentRender`,
which it feeds. An app file of its own that passes `classNameContainer=` to `AttachmentsCarousel` renames the prop.

## What & why

`frontend/src/modules/attachment/attachments-carousel.tsx` took `classNameContainer` and passed it on as
`AttachmentRender`'s `containerClassName`: two names for one class string. The carousel now takes `containerClassName`
too, the order the repo uses for every other class prop (`itemClassName`, `imageClassName`). The value and the
rendering are unchanged.

## Blast radius

Sync-breaking only for app-owned files that pass the old prop: `pnpm ts` fails on them. The `marketing` module is
`owner: 'app'`, so its `device-mockup.tsx` never syncs, in raak or in projectcampus. No database, cache or rendering
change.

## Run

No script: manual.

## Manual steps

1. In `frontend/src/modules/marketing/device-mockup.tsx` (raak and projectcampus), write `<AttachmentsCarousel … containerClassName={className} />` where it says `classNameContainer={className}`.

## Verify

```sh
pnpm --filter frontend ts
pnpm check
```
