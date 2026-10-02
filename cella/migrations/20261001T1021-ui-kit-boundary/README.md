---
syncBreaking: true
clientCacheBump: false
roots: frontend/src
---

# App compositions leave the ui kit

SubmitButton moves from ~/modules/ui/button to ~/modules/common/form-fields/submit-button,
ComboboxSelect (with ComboboxSelectProps and ComboBoxOption) to
~/modules/common/form-fields/select-combobox/combobox-select, ComboboxSearchInput to
~/modules/common/combobox-search-input, and ResponsiveSelect to
~/modules/common/form-fields/responsive-select, so every file in frontend/src/modules/ui maps to one
upstream shadcn component. No behaviour changes. The codemod moves the named imports and drops
emptied declarations; pnpm lint:fix sorts them.

## What & why

`SubmitButton` moves to `~/modules/common/form-fields/submit-button`, `ComboboxSelect` (with `ComboboxSelectProps`
and `ComboBoxOption`) to `~/modules/common/form-fields/select-combobox/combobox-select`, `ComboboxSearchInput` to
`~/modules/common/combobox-search-input`, and `ResponsiveSelect` to `~/modules/common/form-fields/responsive-select`.
They use the toaster, i18n, avatars and spinners, so they belong to the app; every file left in
`frontend/src/modules/ui` maps to one upstream shadcn component. No behaviour changes.

## Blast radius

Frontend only. Sync-breaking for app files that import these five names from their old paths; the codemod rewrites
them. No `clientCacheVersion` bump, no database change.

## Run

```sh
pnpm exec tsx cella/migrations/20261001T1021-ui-kit-boundary/move-ui-compositions.ts inventory frontend/src   # report only
pnpm exec tsx cella/migrations/20261001T1021-ui-kit-boundary/move-ui-compositions.ts rewrite   frontend/src   # apply
pnpm lint:fix
```

## Manual steps

1. If the sync kept `frontend/src/modules/ui/responsive-select.tsx` or `frontend/src/modules/ui/stories/combobox.stories.tsx`, delete them.

## Verify

```sh
rg "SubmitButton|ComboboxSelect|ComboboxSearchInput|ResponsiveSelect" frontend/src | rg "modules/ui/"
pnpm check
```
