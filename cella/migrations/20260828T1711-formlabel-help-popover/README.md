# FormDescription removed: field help moves into a FormLabel popover

## What & why

`frontend/src/modules/ui/field.tsx` no longer exports `FormDescription` (cella #1105, adopted from
projectcampus). Field help text now rides on the label: `FormLabel` accepts a `help` prop and
renders it behind a question-mark popover next to the label text, so forms lose the inline
always-reserved description row and its collapse toggle. `FieldDescription` stays exported but is
now a plain paragraph (its own collapse behavior is gone). Every cella-side consumer
(`form-fields/domains.tsx`, `form-fields/input.tsx`, `form-fields/slug.tsx`,
`update-organization-form.tsx`, `invite-bulk-email-form.tsx`, `stories/form.stories.tsx`) already
uses the `help` prop.

## Blast radius

Sync-breaking for any fork-local file that imports `FormDescription` from `~/modules/ui/field`:
the import fails to resolve after sync, so `pnpm check` reports every affected file. No wire,
database, or cache change (`clientCacheVersion` untouched, no lens). An app that never used
`FormDescription` in fork-local files is unaffected. Visual side effects of the same PR that need
no action: soft buttons use the new `soft-*-strong` steps, unseen badges are filled
(`bg-primary`), and textareas gained `focus-effect` styling.

## Run

No script — manual. The pattern is a two-line mechanical edit per call site; find them with:

```sh
grep -rln "FormDescription" frontend/src
```

## Manual steps

1. In each hit, move the description content into the sibling label:
   `<FormLabel>X</FormLabel> … <FormDescription>Y</FormDescription>` becomes
   `<FormLabel help={Y}>X</FormLabel>` (the `help` prop takes any `ReactNode`; conditional
   wrappers like `{description && <FormDescription>…</FormDescription>}` collapse to
   `help={description}` since a nullish `help` renders no popover).
2. Drop `FormDescription` from the `~/modules/ui/field` import.
3. A call site with no matching `FormLabel` (a bare description paragraph) switches to
   `FieldDescription`, which renders the same plain text without a label.

## Verify

```sh
pnpm check
```

`grep -rn "FormDescription" frontend/src` must come back empty afterwards.
