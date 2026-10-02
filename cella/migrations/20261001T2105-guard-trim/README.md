---
syncBreaking: true
clientCacheBump: false
---

# Guard trim: crossTenantGuard and noImpersonationGuard removed

crossTenantGuard is removed: it repeated what userGuard sets (user, memberships, db = baseDb), and a
route without tenantGuard is cross-tenant by itself. noImpersonationGuard is removed:
refuseImpersonation(session) moves to modules/auth/step-up/helpers/step-up and runs in the handlers
of the step-up routes and revokeMySessions; sysAdminGuard refuses an impersonation (403
impersonation_forbidden, no security alert) before its role check, so every system route,
startImpersonation included, refuses one. stepUpLimiter counts only 401 and 404 as failures, so the
refusal spends none of the user's attempts. Apps drop both guards from their own routes.

## What & why

`crossTenantGuard` did nothing after `userGuard`, which already sets `user`, `memberships` and `db = baseDb`. A route
without `tenantGuard` is cross-tenant by itself. `noImpersonationGuard` is gone too: the handlers of stepping up and
revoking sessions call `refuseImpersonation(session)` (now in `modules/auth/step-up/helpers/step-up.ts`), and
`sysAdminGuard` refuses an impersonation before its role check. Every system route now answers 403
`impersonation_forbidden` during an impersonation.

## Blast radius

App routes or imports that use either guard fail type-checking until edited. No database change, no
`clientCacheVersion` bump. The `x-guard` lists in the spec get shorter.

## Run

No script: manual.

## Manual steps

1. Remove `crossTenantGuard` from every own `xGuard` list and import; keep `userGuard`.
2. Remove `noImpersonationGuard` from every own route; on a non-system route, call `refuseImpersonation(ctx.var.session)` first in its handler (a route behind `sysAdminGuard` needs nothing).
3. Import `refuseImpersonation` from `#/modules/auth/step-up/helpers/step-up` instead of `#/middlewares/guard/no-impersonation-guard`.
4. An own route whose fail-counting limiter counts 403 and that refuses an impersonation in its handler: give the limiter `failStatusCodes` without 403, as `stepUpLimiter` does.

## Verify

```sh
pnpm sdk
pnpm --filter backend exec vitest run tests/security/impersonation.test.ts tests/security/step-up.test.ts tests/security/step-up-routes.test.ts
pnpm check
```
