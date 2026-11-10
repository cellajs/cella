---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: provisional, demo_session_restricted, provisional_account, addressDomain, isDemoAddress, includeProvisional
---

# A demo signs in as an anonymous account, which the API serves without an address and user-level routes refuse by default

Put `xAnonymous: true` on every app route with `userGuard` and no tenant guard that an anonymous session (a demo's) must reach, port `data.sql` into the app's `backend/drizzle` (the session strategy `demo` is `anonymous`), drop `demo.addressDomain` from `shared/config/config.default.ts`, and read `user.isAnonymous` where app code read the address suffix (`isDemoAddress` is gone); `User.email` is `string | null`.

## What & why

A demo account's placeholder address leaked into a cella-owned form: the client knew a demo only by its address. The account is now an anonymous account (`insertAnonymousUser`, `startAnonymousSession`, strategy `anonymous`), served as `email: null` with `isAnonymous`; `createXRoute` gates every user-level route against an anonymous session unless it carries `xAnonymous`; `demo_session_restricted` and `provisional_account` are `anonymous_session_restricted` and `anonymous_account`; `listUsers` takes `includeAnonymous`; the permission engine's no-actor access is `{ visitor: true }`. Docs: `cella/ANONYMOUS_SESSIONS.md`.

## Blast radius

Every app with demos on, or with routes an anonymous session calls: those routes refuse it until marked. Every app's client meets `User.email: string | null`. One data migration on `sessions`. No client cache bump. An app without demos and without address-reading code sees only the compiler's findings.

## Run

No script: manual.

## Manual steps

1. Add `xAnonymous: true` under `xGuard` on each app route with `userGuard` and no `tenantGuard` that an anonymous session must reach (a read about the account; never an action that binds, mails, connects or pushes); `pnpm --filter backend test -- tests/security/anonymous-gate.test.ts` names the ones still refused.
2. Copy `data.sql` into a new dated folder under `backend/drizzle` as `migration.sql`.
3. Remove `addressDomain` from `demo` in `shared/config/config.default.ts`.
4. Replace every app read of `isDemoAddress` or the address suffix with `user.isAnonymous`, and handle `email: null` where the compiler points.
5. Rename `provisional` to `anonymous` in app search params and copy that named it (`accounts=anonymous`, `anonymous_accounts`).

## Verify

```sh
pnpm --filter backend test -- tests/security/anonymous-gate.test.ts tests/security/demo-tenant.test.ts
pnpm check
```
