---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: web-push, shouldUnescape, returnEmptyString
---

# i18next 27 and web-push 4 change what app code may write

App code that calls `t()` with an optional options argument, or leaves out a `{{variable}}`, no longer typechecks. `web-push`
has named exports only, `shouldUnescape` on `Trans` is ignored with a warning, and an empty translation falls back to the
default language in place of rendering blank.

## What & why

A dependency update took i18next 27, react-i18next 18 and web-push 4. `strictInterpolationChecks` now defaults on and
`returnEmptyString` off. web-push 4 is ESM without a default export, while `@types/web-push` still allows
`import webpush from 'web-push'`, so that import typechecks and stops the process at startup.

## Blast radius

Breaking for an app with its own `t()` wrappers, `web-push` imports or empty translations. No `clientCacheVersion` bump,
lens or database change. An app that never customized these is unaffected.

## Run

No script: manual.

## Manual steps

1. Give the options of a `t()` wrapper a default (`options: TOptions = {}`) and pass the variables the compiler names.
2. Replace `import webpush from 'web-push'` with named imports.
3. Remove `shouldUnescape` from `Trans` and from `react.transDefaultProps`.
4. Give an empty translation meant to render nothing an explicit `t('key', '')`, or set `returnEmptyString: true`.

## Verify

Start `pnpm dev`, confirm the backend boots, and read the app's pages that use a translation left empty on purpose. Then:

```sh
pnpm check
```
