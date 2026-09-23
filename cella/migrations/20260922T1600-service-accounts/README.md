# service accounts and API keys: the first machine principal

## What & why

Two new tables, `service_accounts` (a machine principal: tenant-scoped, role bindings in `bindings`, disabled never
deleted) and `api_keys` (opaque keys, hash only, `scopes` mask). `serviceGuard` authenticates
`Authorization: Bearer <app>_sk_live_…` (or `x-api-key`) as that account; `actorGuard` accepts a session or a key on
routes whose operations take `ActorContext`. Scopes are derived from the policy matrix (`accessScopes` next to
`policyMatrix`, `<entityType>:read|write`) and applied as a mask in `checkAccess*` and collection reads. The points
limiter keys on `(tenantId, principalId)`; CSRF is skipped for requests carrying a machine credential. AUTH_SUBSTRATE_PLAN Phase B.

## Blast radius

Database change (two tables, tenant `restrictions` default gains `serviceAccount` and `apiKey` quotas), not
sync-breaking, no cache bump. API adds the `service-accounts` module and an `apiKey` security scheme. Apps whose
`permissions-config.ts` destructures `configurePermissions(...)` gain an `accessScopes` export for free. Apps with their own
route files choose per route whether to accept keys (`actorGuard`) or stay session-only (`userGuard`).

## Run

No script: manual.

```sh
pnpm generate
pnpm sdk
```

## Manual steps

0. Rename the guards everywhere: `git ls-files '*.ts' '*.tsx' '*.md' | xargs perl -pi -e 's/\bauthGuard\b/userGuard/g'` (`authGuard` is now `userGuard`, the session-only guard; `serviceGuard` takes API keys; `actorGuard` takes either).
1. Add `'service_accounts'` and `'api_keys'` to `fullCrudTables` in `backend/scripts/migrations/10-rls.migration.ts` if the app pins that file (they are auth tables, not RLS tables).
2. Add `api_keys, service_accounts` to test `TRUNCATE` lists that include `users`.
3. Routes a machine may call: switch `xGuard: [userGuard, ...]` to `[actorGuard, ...]` on routes whose operations are typed `ActorContext`. Never on a route whose operation reads `ctx.var.user`.
4. Hand-built contexts in tests (`{ var: { memberships } }`) also need `actor: { kind: 'user', id, bindings: memberships, scopes: null }`; guards read `actor.bindings`, and a user's binding must carry `userId` to count as a membership row.
5. `Actor` is a union (`UserActor | ServiceActor`); code that surfaces a grant as a membership row narrows with `isMembershipRow` (`memberships/helpers/select.ts`). `ActorContext` no longer promises `organization`; operations behind `orgGuard` that read it take `OrgContext`. The shared SQL actor type is now `PredicateActor` (was `Actor`).
6. Id brands (`backend/src/db/utils/ids.ts`): columns referencing `users.id` are `$type<UserId>()`, columns referencing `principals.id` are `$type<PrincipalId>()`, `service_accounts.id` is `ServiceAccountId`. Plain strings still flow in everywhere; what fails to compile is a service account's id (or `actor.id`, the union) written into a user-only column. App tables with a `userId` / `createdBy` column that references `users.id` get the same `.$type<UserId>()`; product and channel tables inherit it from the column helpers. `backend/tsconfig.json` turns on `noImplicitOverride` and `noImplicitReturns` (shared is checked through it; the frontend is not there yet).
7. App quotas: `defaultRestrictions.quotas` may set `serviceAccount` and `apiKey` (0 = unlimited; template defaults 20 and 100).
8. Rate limiters keyed on `'userId'` keep working for sessions; use `'principalId'` for limits that must also cover keys.

## Review round (2026-09-22)

- `service_accounts.updatedBy` and `api_keys.revokedBy` record who disabled or revoked (one regenerated migration, `20260922193615_auth_substrate`, carries every table of this plan). `*-queries.ts` never throws and takes `(ctx, opts)`; the admin check and the
  404 live in `helpers/managed-service-account.ts`; one operation per file. Quotas count active accounts and live
  keys only. Keys and their account are cached by hash (`middlewares/guard/api-key-cache.ts`) for a minute;
  revoke, roll and disable invalidate. A service account with no binding is refused at `tenantGuard`.
- Every guard declares the OpenAPI `security` it accepts (`security:` in its `xMiddleware` options); an app guard
  does the same and `createXRoute` emits it. `Access.scopes` is required: a hand-built access states `scopes: null`.
- `assertTenantQuota` throws `entityType` for entity keys and `meta.resource` for principal keys; apps that read
  `restrict_by_app` errors see both shapes.

## Verify

```sh
grep -rn "xGuard: \[userGuard" backend/src/modules/<your-product>/*-routes.ts
pnpm generate
pnpm sdk
pnpm check
```

## Naming round (2026-09-22)

- Names follow what other systems call these things: the keys table is `api_keys` (`ApiKey`, `apiKeysTable`,
  `issueApiKey`, routes `…/service-accounts/{id}/keys`); `credential` stays the generic word for what proves a caller, never a name. The OAuth scope
  vocabulary is `AccessScope` / `accessScopes` (`accessScopes.all/required/allows/parse`), qualified because `scope`
  was already the engine's read-scope family; the wire word `scope` is unchanged. A service account's role bindings
  are `bindings` (`RoleBinding`, `actor.bindings`, `ActorBinding`); `grants` stays the engine's word. The quota key is
  `apiKey`.
- Dropped as not yet read by anything: `lastUsedAt` on accounts and keys (and the stamping in the guard),
  `description` on both, the key `type` column (the key format still carries `sk` / `pk`). Add them back with the
  screen that shows them.
- The nine migrations this plan produced during review are squashed into `20260922193615_auth_substrate` (+ its
  `side_effects`); apps that already applied an earlier folder reset their database.
