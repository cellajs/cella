# UI kit fixes against Base UI 1.8

## What & why

`Button` defaults to `type="button"` and renders `loading` (spinner, disabled, `aria-busy`). `Select` drops its
label registry: pass Base UI's `items` when labels differ from values. `InputOTP` runs on Base UI's OTPField, so
`input-otp` is removed (`maxLength` is `length`, `onChange` is `onValueChange`, slots take no `index`,
`containerClassName` is `className`). `SelectRoleRadio` and `SelectRoles` take a `label` legend. `PopoverContent` and
`DropdownMenuContent` take `positionerClassName` for z-index.

## Blast radius

Frontend only. Sync-breaking for an app with an untyped `Button` meant to submit, a `Select` relying on registered
labels, `InputOTP` usage, or a `FormLabel` over a role selector. No `clientCacheVersion` bump, no database change.

## Run

No script: manual.

## Manual steps

1. `rg -U "<Button(?![^>]*\btype=)[^>]*>" frontend/src`: inside a `<form>`, a Button meant to submit gets `type="submit"` (or becomes a `SubmitButton`).
2. `rg "<SelectValue" frontend/src`: where a `SelectItem` label differs from its value, pass `items` (`{ value, label }[]` or a record) to `Select`.
3. `rg "ui/totp'" frontend/src`: rename `maxLength` to `length`, `onChange` to `onValueChange`, `containerClassName` to `className`, drop `index` on `InputOTPSlot`, and remove any `FormControl` around `InputOTP`. Then remove `input-otp` from `frontend/package.json` and run `pnpm install`.
4. `rg -B2 "<SelectRole(Radio|s)\b" frontend/src`: move a sibling `FormLabel` text into the selector's `label` prop.
5. `rg "z-[0-9]+" frontend/src | rg "PopoverContent|DropdownMenuContent"`: move z-index classes from `className` to `positionerClassName`.

## Verify

```sh
rg "input-otp|maxLength=" frontend/src
pnpm check
```
