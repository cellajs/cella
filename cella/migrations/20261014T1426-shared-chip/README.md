---
syncBreaking: false
clientCacheBump: false
---

# One `Chip` for removable values, and picker fields that do not nest buttons

`frontend/src/modules/ui/chip.tsx` exports `Chip`, the pill for a selected value with an optional remove button, and
`SelectEmails` uses it. Replace the chips your app builds by hand (label pickers in create forms, typically a `Badge`
in a `rounded-full border bg-border` wrapper with an `XIcon`) with `<Chip onRemove removeLabel>`, and lay a picker's
trigger behind its chips instead of around them.

## What & why

Apps had grown three chip variants with different sizes, text and remove controls; one removed through a `div` that
neither keyboard nor screen reader could reach, nested inside the picker `<button>`. `Chip` makes the remove a real,
named button. A button cannot contain it, so the picker trigger lies behind the chip row, which ignores the pointer
except on remove buttons. `ui/stories/chip.stories.tsx` (`InPickerField`) shows the pattern.

## Blast radius

Apps with hand-built removable chips or chips inside a picker button. Not sync-breaking: nothing is renamed or
removed, and the invite email chips change look only. No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. `rg "rounded-full border bg-border|XIcon" frontend/src --glob '*.tsx'` and pick out the chips that show a selected value.
2. Replace each with `<Chip onRemove={() => …} removeLabel={t('c:remove_resource', { resource: name })}>{name}</Chip>` from `~/modules/ui/chip`, or `<Chip>{name}</Chip>` when it cannot be removed; pass label colors through `className`.
3. Where the chips sit inside the picker's `<button>`, make the field a `div` with `buttonVariants({ variant: 'input' })` and `relative`, put the trigger in it as `<button className="focus-effect absolute inset-0 rounded-md" aria-label=…>`, and wrap the chips in `<div className="pointer-events-none relative flex flex-wrap items-center gap-1">`, as `InPickerField` does.
4. Drop the `biome-ignore` comments the old `div` remove control needed.

## Verify

```sh
pnpm --filter frontend exec vitest run --project storybook src/modules/ui/stories/chip.stories.tsx
pnpm check
```
