---
syncBreaking: true
clientCacheBump: false
---

# An app's own error types live in `appError.json`, and a failed resource mutation shows the server's reason

Create `locales/<lng>/appError.json` holding `{}` for each language and add those paths to `overrides.ignored` in
`cella/cella.config.ts`: `backend/src/lib/i18n-locales.ts` imports them. Pass the error to each handler
`createResourceError` returns (`handleError('update', error)`). Remove every local error toast on a mutation that
keeps the global one.

## What & why

`ErrorKey` in `backend/src/core/error.ts` reads the keys of `appError.json` beside those of `error.json`, so
`new AppError(409, '<your_type>', 'warn')` typechecks once the type has a title there; the template ships the file
empty. `createResourceError` takes the failed mutation's error and shows a 4xx's explanation under its title. The
global handler toasts every `ApiError`, so a local `onError` toast beside it showed the failure twice.

## Blast radius

Every app: typecheck fails until both JSON files exist and each `createResourceError` handler gets the error. An
app that registered `appError` in `i18n-locales.ts` by hand takes upstream's file. No database change, no
`clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. Add `locales/<lng>/appError.json` for each language to `overrides.ignored` in `cella/cella.config.ts`, and create each file holding `{}`: the sync removes an ignored file your app lacks.
2. An app that registered the `appError` namespace in `backend/src/lib/i18n-locales.ts` by hand takes upstream's version of that file and re-adds its own languages.
3. For an error type of your own: add `<type>` (title) and `<type>.text` (explanation) to `locales/en/appError.json`, then throw `new AppError(status, '<type>', severity)`. A cast to `ErrorKey` can go.
4. Pass the error at each call of a `createResourceError` handler: `onError: (error) => handleError('update', error)`.
5. Remove an `onError` toast from a mutation that does not set `meta.suppressGlobalErrorToast`. Where the mutation can fail before any request (a passkey prompt), keep it behind `if (!(error instanceof ApiError))`.
6. An `ApiError` your frontend builds for a `*_resource` type sets `entityType` and `severity`: without them the toast title shows `{{resource}}` and renders as info.

## Verify

```sh
pnpm check
pnpm test
```
