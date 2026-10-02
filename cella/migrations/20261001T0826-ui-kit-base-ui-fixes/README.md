---
syncBreaking: true
clientCacheBump: false
---

# UI kit fixes against Base UI 1.8

Bug fixes from the shadcn/Base UI alignment audit. Button defaults to type="button", so an untyped
Button inside a form no longer submits it, and its loading prop now disables the button, sets
aria-busy and overlays a spinner. Select drops the label registry that only filled after the popup
first opened: pass Base UI's items to Select when labels differ from values. InputOTP is rebuilt on
Base UI's OTPField and input-otp is removed (length, onValueChange, className; slots take no index).
TabsTrigger styles the active tab through data-active and merges className; switch, radio and label
disabled styles use data-disabled. SelectRoleRadio and SelectRoles take a label legend, replacing a
FormLabel that named every option after the group. PopoverContent and DropdownMenuContent take
positionerClassName so z-index overrides apply; DropdownMenuSubContent builds on DropdownMenuContent
and scrolls. Dialoger and sheeter render titles and descriptions only when set, so untitled overlays
pass a title with a hidden header; the dropdowner drawer is named after its trigger.

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
