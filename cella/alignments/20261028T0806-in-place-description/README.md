---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: CardDescriptionSlot, card-description-slot
---

# A description shown in place builds on useInPlaceDescription

`common/blocknote/use-description-slot.ts` is `use-in-place-description.ts`: `useDescriptionSlot` is
`useInPlaceDescription`, its return type `DescriptionSlot` is `InPlaceDescription`, and `<DescriptionLayers>` takes it
as `inPlace` where it took `slot`. The hook's options and the fields it returns keep their names.

## What & why

"Slot" names a placement slot (`getTools(slot)`, `appConfig.surfaces`). The hook's own doc calls it a description shown
in place, so the API takes that wording, and the layers prop stops shadowing the DOM's `slot` attribute.

## Blast radius

App code that imports the hook or passes `slot` to `<DescriptionLayers>`: raak `task/card/card-description-slot.tsx`,
projectcampus `common/product-document.tsx`. No wire, database or cache change.

## Run

No script: manual.

## Manual steps

1. Import `useInPlaceDescription` from `~/modules/common/blocknote/use-in-place-description` and call it where `useDescriptionSlot` was.
2. Pass the result to `<DescriptionLayers inPlace={...}>` where it went to `slot={...}`.
3. Optional: rename an app component named for the slot, such as `CardDescriptionSlot` (raak `task/card/card-description-slot.tsx` and `task/card/task-card.tsx`; projectcampus `item/card/card-description-slot.tsx` and `item/card/item-card.tsx`).

## Verify

```sh
pnpm check
```
