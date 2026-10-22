---
syncBreaking: true
clientCacheBump: false
---

# Forms resolve through formResolver and take noValidate

Every app form replaces `zodResolver(schema)` from `@hookform/resolvers/zod` with `formResolver(schema)` from
`~/utils/form-resolver`, and its `<form>` gets `noValidate`. `pnpm style` reports both (`form-resolver`,
`form-no-validate`) for an app-owned form that still has the old shape.

## What & why

Zod's global `customError` is now `formErrorMessage` (`frontend/src/utils/form-error-message.ts`), so a field shows plain,
translated words. `formResolver` empties a blank field, so a cleared optional one submits null. `noValidate` keeps the
browser's bubble from answering first. `defaultOnInvalid` no longer toasts when every error shows under its field.

## Blast radius

Every app with forms of its own. No database or cache change. The `error.json` keys `form.min`, `form.pattern`,
`form.validate` (and the other zod v3 and react-hook-form rule keys), `name_required` and `name_too_short` are gone.

## Run

No script: manual.

## Manual steps

1. `grep -rln "@hookform/resolvers/zod" frontend/src`: in each file import `formResolver` from `~/utils/form-resolver` and call it in place of `zodResolver`.
2. Add `noValidate` to each `<form onSubmit={form.handleSubmit(...)}>`.
3. Drop per-form `'' -> null` preprocessing (`.transform((v) => (v === '' ? null : v))`): `formResolver` does it for every nullable field.
4. Replace a reference to a removed `error:form.*` key with `error:form.required` or a key of the app's own.
5. Give every required field a defined default (`''`, `[]`, `null`): an undefined one now reads "Required", which is right only for a field the user sees.

## Verify

```sh
pnpm style
pnpm check
```
