# Access hardening: sessions, tokens, second factors, the authorization server, data access, realtime and infra

## What & why

Session cookies carry a random token the database stores hashed; every session ending goes through `endSessions`; one
token module issues and spends every token. Second factors are single-use, account-security actions need a step-up,
and one grant policy governs the authorization server, its revocations reaching every process. Cross-scope reads
return narrow shapes and uniform refusals, media follows one reference grammar, the Yjs relay takes per-entity
Ed25519 tokens on an internal listener, secrets are scoped, and logs are redacted.

## Blast radius

Sync-breaking for every app: everyone signs in again, OAuth clients consent again, and `clientCacheVersion` is bumped.
One schema migration and one side-effect set, new env vars and a privileged infra Apply. Apps that customized auth,
tokens, memberships, uploads, the relay, limiters or logging have manual steps below.

## Run

No script: manual.

## Manual steps

**Database, env, config and infra**

1. Dedupe passkeys before migrating: `SELECT credential_id FROM passkeys GROUP BY 1 HAVING count(*) > 1`.
2. `pnpm --filter backend generate` emits one schema migration (`passkey_challenges`, `totps.last_used_step`, the unique `passkeys.credential_id`, `sessions.impersonator_session_id`/`stepped_up_at`/`stepped_up_via`, `tokens.pending_sign_up`/`session_id`) and one side-effect set (`membership_rules`, the channel path and unsubscribe hash backfills, grants); commit both.
3. Replace `YJS_SECRET` in every env with `YJS_TOKEN_PRIVATE_KEY`, `YJS_TOKEN_PUBLIC_KEY` and `YJS_RELAY_SECRET` (`pnpm --filter backend yjs:public-key` derives the public key); set `INTERNAL_PORT` where the default does not fit.
4. Rotate any `COOKIE_SECRET` entry or `UNSUBSCRIBE_SECRET` shorter than 16 characters before deploying.
5. Set `RUN_JOBS` on the service that should run the scheduled jobs if an app moved `primaryRollout`; expect the first production run of the reaper, digest, device prune and OAuth sweep.
6. Add `devPorts.internal` and `mediaAssetOrigin: ''` to the app config; an app with its own `cookieVersion` bumps it.
7. In `transloadit-config.ts`, set `publicBucket: true` on avatar and cover, `false` on attachment, and add the `newsletter` template and id; in the Transloadit workspace, turn on "Require a correct Signature".
8. Infra: rename `internalRoute` to `internalPort`, drop `mcp` from the CDC, Yjs signing key, relay and admin-email entries of `runtime-secrets.config.ts`, then run the privileged `Apply` and check the preview moves secret paths and replaces nothing.
9. Infra code: import `db-exposure-acl` from `infra/lib`, pass the plan path to `parseBootPlanJson`, and throw from tasks.
10. Optional: `DELETE FROM oidc_payloads WHERE type IN ('AuthorizationCode','RefreshToken') AND payload ? 'jti';`
11. Next release: remove the public `/yjs/materialize` 503 bridge.

**Sessions and sign-in**

12. Replace `getParsedSessionCookie`, `validateSession` and `ctx.var.sessionToken` with `resolveSession`, `readSession` and `ctx.var.session`.
13. Replace `revokeSessions` with `endSessions`; listeners of `session.revoked` handle its `reason` and `'all'`.
14. Every process with guard caches calls `listenForAuthInvalidation()` on a session-mode connection.
15. Custom stream clients reconnect on `session_replaced` and `access_changed`; app-registered `AppStreamSubscriber`s carry `systemAccessAllowed`, and callers of `closeAppStream` use `closeAppStreams`.
16. Every route in an app's own auth modules declares `'x-strategy'`, then `pnpm --filter frontend gen:routes`.
17. Tests build cookies with `authCookie(name, content)` (`createTestSession` already signs); scripts sign with `sealAuthCookie` or use `pnpm --filter backend session:mint <email>`; a test that opens a magic link as the browser that asked sends `authCookie('magic-requested', tokenId)`.
18. Expect 403 `impersonation_forbidden` from `revokeMySessions` during an impersonation.

**Tokens and sign-up**

19. Move direct `tokensTable` reads and writes into `backend/src/modules/auth/tokens/`; replace `getValidToken` and `getValidSingleUseToken` with `invokeToken`, `readBoundToken` or `spendCookieToken`.
20. Give every app token type a `tokenPolicies` entry with `replaces` (and `unboundOpener` for links), a `linkHandlers` entry per link type, and add `oauth-connect` and `step-up` to `tokenTypes`.
21. Issue cookie tokens that serve one session with `sessionId`; a custom sign-out spends `oauth-connect` and calls `dropHeldMagicLink`.
22. Route app sign-up checks through `maySignUp(ctx, { email })`; an unverified OAuth result has no `invite` reason.
23. `findInvitationToken` takes `{ id } | { inactiveMembershipId }`; callers of `resendInvitationWithToken` send `{ tokenId }`.

**Second factors and step-up**

24. Replace `validateTOTP`, `verifyTOTPWithGracePeriod` and `validatePasskey` with `verifyTotp` and `verifyPasskeyAssertion`; drop `email` from passkey challenge and verification bodies.
25. Read `check-email` as `{ recognized }` and treat `POST /requests` as 204.
26. Add `stepUpGuard` to app-owned account-security routes and to routes that mint API keys or other lasting secrets, and wrap their frontend calls in `withStepUp`; call `startOAuthConnect` before an app's own connect UI.

**Authorization server**

27. Import `invalidateOauthClientCache` from `oauth-server/client-cache`; replace `refusalFor` with `grantRefusal` and `tokenUserCache` with the token grant cache.
28. Revoke grants through `revokeGrant`; replace `invalidateApiKeyCacheByAccount` with `invalidateCache.serviceAccount` or `invalidateCache.installation`; pass the `VerifiedAccessToken` to the token-verdict cache functions.
29. Show `target` from the consent details on an app-owned consent page (frontend `ConsentDetails`).

**Data access**

30. Attachment keys start with `<organizationId>/` (a custom upload path keeps that first segment, or adapts `isOrganizationKey`); the server stamps the bucket, so drop `publicBucket` and `bucketName` from `getUploadToken` and `createAttachments` calls; rows outside the prefix no longer presign.
31. Pass the entity's `organizationId` to `assertBlockMediaUrls` and `sanitizeBlockMediaUrls`.
32. App creates behind `checkIdempotency` filter on `createdBy`.
33. Rename `loadActiveTenant` to `loadTenant`; treat an unknown tenant as 403 and an unreadable product as 404.
34. Replace `findMembershipAwareRows` with `findInvitationAccounts` and `findInvitationsToAddresses`; pass `canResend` to the pending table's `useColumns`.
35. Replace the SDK `Membership` type with `UpdateMembershipResponse`, merge or guard these responses before an own-membership cache (as `frontend/src/modules/memberships/query-mutations.ts` does), and pass other users' memberships from app routes through `membershipAsSeenBy`.
36. Test cleanups that delete memberships before their organizations run in one transaction (the last-admin trigger).

**Realtime**

37. Pass `organizationId` to `CollaborativeBlockNote`; drop `YjsTokenFetcher` and `collaborativeProduct`.
38. App materializers refuse with a 403 or 404 `AppError`; custom Yjs clients treat close code 1011 as transient and 4400 as final.
39. App worker pools import `queryLoggerEnabled` from `#/db/create-connection`.

**Telemetry, email and limits**

40. Import `scrubUrl` from `shared/utils/scrub-url` and add app token routes to `secretPathTemplates` or `sensitiveQueryKeys`; pass `redactPaths` to every `createLogger`; log queries on `pgDetail` find nothing any more (use `pgCode` and `pgConstraint`).
41. Email templates: keep markup in the translation string, spread `plainText` on text outputs, name params with `param('<key>')`, and declare HTML params in `htmlParams`; replace module-load `t()` calls in schemas with `translatedError(key)`.
42. Insert unsubscribe rows through `unsubscribeTokenRow`; pass `since` to `buildDigestForUser` and `findUndigestedNotifications`, and the recipient's language to `renderSectionsHtml`; add `magic_opened` and `email.digest_overflow` to app locales.
43. Replace imports of `StaticDocumentBody`, `BlockNoteMinimalHtml` and `sanitizeUrl`.
44. Fake limiter stores in app tests need `penalty` (the reservation) and `reward` (the refund).

## Verify

```sh
pnpm --filter backend generate
pnpm vitest run --project=backend backend/tests/security
pnpm check
```
