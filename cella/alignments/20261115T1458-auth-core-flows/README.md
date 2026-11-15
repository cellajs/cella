---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: modules/auth/sessions, modules/auth/general, modules/auth/tokens, modules/auth/oauth, modules/auth/sso, modules/auth/passkeys, modules/auth/totps, modules/auth/magic, modules/auth/step-up, modules/auth/devices, modules/auth/invitations, modules/auth/anonymous, modules/auth/rate-limits-db, modules/auth/legal, me/operations/get-my-auth, me/operations/toggle-mfa, me/operations/revoke-my-sessions, auth_strategy
roots: backend/src, frontend/src
---

# The auth module is core, flows and account, with one index for the rest of the app

App code imports the auth module through `#/modules/auth/core` (its index) or by the new paths: `core/` holds
sessions, step-up, devices, tokens, invitations, anonymous accounts, federations, cookies and mails; `flows/` the sign-in
methods (magic, passkeys, totps, oauth, mfa, sso, the step-up code); `account/` the account-security routes and pages
that were in `me`. `identities` moved to `modules/user`, the rate-limit store to `middlewares/rate-limiter`, user-agent
parsing to `lib/device-info`, the legal texts to `frontend/src/modules/marketing/legal/`. `AuthStrategy`,
`StepUpProof` and `amrOf` come from `shared`. The routes `/me/auth`, `/me/sessions/~revoke` and `/me/~toggle-mfa` are
`/auth/me`, `/auth/sessions/~revoke` and `/auth/~toggle-mfa` under the same SDK functions. The codemod rewrites the import
paths.

## What & why

The module's waist (`resolveSession`, `setUserSession`, `createAccount`, `identities`) was narrow, but 40 files reached
into it by deep path and the account page read the proof tables. Now `core/index.ts` names what the rest of the app may
import, `backend/tests/auth-boundary.test.ts` holds the line, the token engine takes link openers from the flows
(`registerLinkHandler`, `registerHeldLink`), and `flows/` is the one folder another authenticator would replace. A
lossless export (`pnpm --filter backend auth:export`) and `amr` + `auth_time` claims on the app's tokens came with it.

## Blast radius

Every app: template imports arrive rewritten, and app files that import auth internals fail typecheck until re-pointed,
which the codemod does for paths. Three account routes moved, so `clientCacheVersion` is bumped. Two pinned paths move.
Passkeys gain four nullable columns (a migration). Tokens gain two claims; `auth_strategy` stays.

## Run

```sh
pnpm cella align --run 20261115T1458-auth-core-flows                                          # report only
pnpm cella align --run 20261115T1458-auth-core-flows -- rewrite backend/src frontend/src       # apply
```

## Manual steps

1. Move the app's pinned copies: `backend/src/modules/auth/sso/role-from-claims.ts` to `backend/src/modules/auth/flows/sso/role-from-claims.ts`, `frontend/src/modules/auth/legal/legal-config.ts` to `frontend/src/modules/marketing/legal/legal-config.ts`; update both paths in `cella/cella.config.ts`.
2. An app file outside `modules/auth` that imports a path the index does not export: import it from `#/modules/auth/core` when it is contract, else move the file into the module, as the account page did.
3. Import `AuthStrategy`, `StepUpProof` and `stepUpProofs` from `shared`, `authStrategiesEnum` from `#/modules/auth/core`.
4. An app that added a link token kind registers its opener with `registerLinkHandler` or `registerHeldLink` where its handlers load.
5. An app that reads `auth_strategy` off an access token may read `amr` (RFC 8176) and `auth_time` as well.
6. `pnpm generate` is not needed: the passkey migration ships with the template.

## Verify

```sh
pnpm cella align --run 20261115T1458-auth-core-flows   # prints 0 imports to rewrite
pnpm check
```
