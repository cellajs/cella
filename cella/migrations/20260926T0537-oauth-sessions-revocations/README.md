# Authorization server sessions follow the app session, revocations reach every process

## What & why

The provider's `appInteractionPolicy` asks for sign-in unless the same person has a live app session, and `endSessions`
deletes their provider sessions. Codes and refresh tokens outlive that session. `revokeGrant` announces every grant
deletion, and `auth_invalidate` gains `grant`, `serviceAccount` and `installation` messages, so revocations reach every
process at once. Service accounts mint only for their own tenant's resource. `oauthRequestLimiter` budgets `/oauth`.
Consent details carry `target: { tenant, organization }`.

## Blast radius

Sync-breaking for apps that extend the authorization server, its caches or the consent page. No database change. During
a rolling deploy, old processes log the new messages as malformed. Tokens issued before the deploy still end with their
one-day provider session.

## Run

No script: manual.

## Manual steps

1. Revoke grants through `revokeGrant`; `deleteConsentWithTokens` drops no cached verdicts.
2. Replace `invalidateApiKeyCacheByAccount` with `invalidateCache.serviceAccount` or `invalidateCache.installation`.
3. Pass the `VerifiedAccessToken` to the token-verdict cache functions.
4. Show `target` from the consent details on an app-owned consent page (frontend `ConsentDetails`).

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/oauth-grants.test.ts backend/tests/security/oauth-request-limit.test.ts backend/src/middlewares/guard/invalidation-listener.test.ts
pnpm check
```
