---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: toSafeRedirectPath, frontendRedirectPath, SafeRedirectPathOptions
---

# One safeRedirectPath for backend and frontend

App code that imported `toSafeRedirectPath` from `shared/utils/safe-redirect-path`, `frontendRedirectPath` from
`#/utils/frontend-redirect-path` or `safeRedirectPath` from `~/modules/auth/redirect-path` imports
`safeRedirectPath` from `shared/utils/safe-redirect-path`. It answers `undefined` for an unsafe path, never `null`.

## What & why

The backend and the frontend each wrapped `toSafeRedirectPath` with their own origin and cap. The checks never needed
the origin: only the path comes back. `safeRedirectPath(input, maxLength?)` is now the one function. The backend
passes `maxLength.field`, and `/api` is the only refused prefix (`denyPrefixes` is gone).

## Blast radius

An app that never imported these helpers is unaffected. No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. Replace each import named above with `import { safeRedirectPath } from 'shared/utils/safe-redirect-path'`.
2. Backend: `frontendRedirectPath(x)` becomes `safeRedirectPath(x, maxLength.field)`.
3. A check for `null` on the result checks for `undefined`.

## Verify

```sh
pnpm check
```
