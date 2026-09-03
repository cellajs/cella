# FormDescription removed: field help moves into a FormLabel popover

## What & why

`frontend/src/modules/ui/field.tsx` no longer exports `FormDescription` (cella #1105, from
projectcampus). `FormLabel` gains a `help` prop rendered as a question-mark popover next to the
label, replacing the always-reserved description row and its collapse toggle. `FieldDescription`
stays exported as a plain paragraph (collapse behavior gone). `form-fields/input.tsx` is the
reference consumer.

## Blast radius

Sync-breaking for fork-local files importing `FormDescription` from `~/modules/ui/field`:
`pnpm check` reports each one. No wire, DB or `clientCacheVersion` change, no lens; apps that never
used it are unaffected. Same-PR visual changes (`soft-*-strong` buttons, filled `bg-primary` unseen
badges, `focus-effect` textareas) need no action.

## Run

No script: manual.

```sh
grep -rln "FormDescription" frontend/src
```

## Manual steps

1. `<FormLabel>X</FormLabel> ... <FormDescription>Y</FormDescription>` becomes
   `<FormLabel help={Y}>X</FormLabel>` (`help` takes any `ReactNode`;
   `{description && <FormDescription>...</FormDescription>}` collapses to `help={description}`, a
   nullish `help` renders no popover).
2. Drop `FormDescription` from the `~/modules/ui/field` import.
3. A call site with no matching `FormLabel` (a bare description paragraph) switches to
   `FieldDescription`.

## Verify

```sh
pnpm check
grep -rn "FormDescription" frontend/src   # must come back empty
```
