# Access hardening: sessions, tokens, second factors, the authorization server, data access, realtime and infra

## What & why

Session cookies carry a random token the database stores hashed; every session ending goes through `endSessions`; one
token module issues and spends every token. Second factors are single-use, account-security actions need a step-up,
and one grant policy governs the authorization server, its revocations reaching every process. Cross-scope reads
return narrow shapes and uniform refusals, media follows one reference grammar, the Yjs relay takes per-entity
Ed25519 tokens on an internal listener, secrets are scoped, and logs are redacted.

## Blast radius

Sync-breaking for every app: apps bump `clientCacheVersion` and `cookieVersion`, everyone signs in again, OAuth
clients consent again, and blocks with external image URLs stop rendering. One schema migration, one side-effect set,
new env vars and a privileged infra Apply.

## Run

No script: manual.

## Manual steps

**Database, env, config and infra**

1. `pnpm --filter backend generate` emits one schema migration (`passkey_challenges`, `totps.last_used_step`, the unique `passkeys.credential_id`, `sessions.impersonator_session_id`/`stepped_up_at`/`stepped_up_via`, `tokens.pending_sign_up`/`session_id`, partial indexes on both new session references, `api_keys.expires_at` with a time zone, `yjs_documents.generation`, the `unsubscribe_tokens` drop) and one side-effect set (`membership_rules`, grants, a verify check of the last-admin trigger); commit both. An app that drops the `10-membership-rules` producer also empties `membershipRuleTriggers`.
2. Replace `YJS_SECRET` in every env with `YJS_TOKEN_PRIVATE_KEY`, `YJS_TOKEN_PUBLIC_KEY` and `YJS_RELAY_SECRET` (`pnpm --filter backend yjs:public-key` derives the public key); set `INTERNAL_PORT` where the default does not fit. Mode-bound secrets (`CDC_SECRET`, `PII_HASH_SECRET`, `UNSUBSCRIBE_SECRET`, `ADMIN_EMAIL`, the Yjs keys) are optional in the env type: read them through `modeSecret()`, declare their minimum length with `secretString(name)`, and list app ones in `env-mode-secrets.ts` (`ADMIN_EMAIL` is read by the migrate process alone). The cdc worker's `API_WS_URL` becomes `BACKEND_INTERNAL_URL`, the internal listener's base URL, as for the yjs worker.
3. Rotate any `COOKIE_SECRET` entry or `UNSUBSCRIBE_SECRET` shorter than 16 characters before deploying; rotating `UNSUBSCRIBE_SECRET` voids the unsubscribe links already sent.
4. Set `RUN_JOBS` on the service that should run the scheduled jobs (the digest, device prune and OAuth sweep) if an app moved `primaryRollout`.
5. In the app's own `shared/config`: add `devPorts.internal` and `mediaAssetOrigin: ''`, and bump `clientCacheVersion` and `cookieVersion` (the template's bumps do not sync).
6. In `transloadit-config.ts`, set `publicBucket: true` on avatar and cover, `false` on attachment, and add the `newsletter` template and id; in the Transloadit workspace, turn on "Require a correct Signature".
7. Infra: rename `internalRoute` to `internalPort`, drop `mcp` from the CDC, Yjs signing key, relay and admin-email entries of `runtime-secrets.config.ts`, then run the privileged `Apply` and check the preview moves secret paths and replaces nothing.
8. Infra code: import `db-exposure-acl` from `infra/lib`, pass the plan path to `parseBootPlanJson`, and throw from tasks.

**Sessions and sign-in**

9. Replace `getParsedSessionCookie`, `validateSession` and `ctx.var.sessionToken` with `resolveSession`, `readSession` and `ctx.var.session`; a reader that may find no session calls `findSession(ctx)` (null on a refusal alone, a failed read throws), and a custom sign-out reads through `readOwnSession`.
10. Replace `revokeSessions` with `endSessions`; listeners of `session.revoked` handle its `reason` and `'all'`.
11. Every process with guard caches calls `listenForAuthInvalidation()` on a session-mode connection and reports it as the critical `authInvalidation` component of `/health?depth=full`.
12. Custom stream clients reconnect on `session_replaced` and `access_changed`; the 401 types that sign a client out are `sessionLostTypes` in `shared/utils/session-lost` (an app's own session reader adds its types there); app-registered `AppStreamSubscriber`s carry `systemAccessAllowed`, and callers of `closeAppStream` use `closeAppStreams`.
13. An app's own sign-out UI ends the session through `endSession({ wipe })` (`frontend/src/modules/auth/end-session.ts`), which flushes seen marks and drops the push subscription first.
14. Every route in an app's own auth modules declares `'x-strategy'`.
15. Tests build cookies with `authCookie(name, content)` (`createTestSession` already signs); scripts sign with `sealAuthCookie` or use `pnpm --filter backend session:mint <email>`; a test that opens a magic link as the browser that asked sends `authCookie('magic-requested', tokenId)`.
16. Expect 403 `impersonation_forbidden` from `revokeMySessions` during an impersonation.

**Tokens and sign-up**

17. Move direct `tokensTable` reads and writes into `backend/src/modules/auth/tokens/`; replace `getValidToken` and `getValidSingleUseToken` with `invokeToken`, `readBoundToken` or `spendCookieToken`. `findBoundToken` and `invitationTokensSubquery` are gone (`readBoundToken`); `spendCookieToken(ctx, type, { db: tx })` leaves the cookie for the caller to delete once the transaction committed; `rememberLinkRequest`, `requestedHere` and `forgetLinkRequest` in `tokens/token-lifecycle.ts` replace the magic and step-up marker helpers, and a used link clears its marker.
18. Give every app token type a `tokenPolicies` entry with `replaces` (and `unboundOpener` for links), a `linkHandlers` entry per link type, and add `oauth-connect` and `step-up` to `tokenTypes`.
19. Issue cookie tokens that serve one session with `sessionId`; a custom sign-out spends `magic` and calls `dropHeldMagicLink`; the `oauth-connect` pin dies with its session.
20. Route app sign-up checks through `maySignUp(ctx, { email })`; an unverified OAuth result has no `invite` reason. `handleCreateUser(ctx, { newUser, via })` writes the email row verified and claims the invitations itself (`emailVerified` and `inactiveMembershipId` are gone); no app path creates an account without inbox proof, since the unproven-account reaper is gone.
21. `findInvitationToken` takes `{ id } | { inactiveMembershipId }`; callers of `resendInvitationWithToken` send `{ tokenId }`.

**Second factors and step-up**

22. Replace `validateTOTP`, `verifyTOTPWithGracePeriod` and `validatePasskey` with `verifyTotp` and `verifyPasskeyAssertion`; drop `email` from passkey challenge and verification bodies.
23. Read `check-email` as `{ recognized }` and treat `POST /requests` as 204.
24. Add `stepUpGuard` to app-owned account-security routes and to routes that mint API keys or other lasting secrets, and `noImpersonationGuard` (403 `impersonation_forbidden`) to routes an impersonation may never call; and wrap their frontend calls in `withStepUp`; call `startOAuthConnect` before an app's own connect UI. PUT /me/mfa takes a step-up and no proof in its body.

**Authorization server**

25. Import `invalidateOauthClientCache` from `oauth-server/client-cache`; replace `refusalFor` with `grantRefusal` for users and `apiKeyRefusal` for a service's API key, and `tokenUserCache` with the token grant cache. An authorization request naming an unknown or foreign resource redirects to the client with `error=invalid_target`.
26. Revoke grants through `revokeGrant`; replace `invalidateApiKeyCacheByAccount` with `invalidateCache.serviceAccount(tx, account)` (the row's `id`, `tenantId`, `oauthClientId`; it covers an installed app's tokens, `invalidateCache.installation` is gone); every `invalidateCache.*` takes the writing database or transaction first and is awaited last in that transaction; app listeners read the `{ serviceAccount: { id, tenantId, clientId } }` message through `parseAuthInvalidation`; pass the `VerifiedAccessToken` to the token-verdict cache functions. Read a client's kind through `clientKindOf(client)` (`oauth-server/adapter`); a Client ID Metadata Document that sets `client_kind` is refused with `invalid_client_metadata`. `deleteConsentWithTokens` runs on the caller's transaction.
27. Show `target` from the consent details on an app-owned consent page (frontend `ConsentDetails`).

**Data access**

28. Attachment keys start with `<organizationId>/` (a custom upload path keeps that first segment, or adapts `isOrganizationKey`); the server stamps the bucket, so drop `publicBucket` and `bucketName` from `getUploadToken` and `createAttachments` calls; rows outside the prefix no longer presign.
29. Pass the entity's `organizationId` to `assertBlockMediaUrls` and `sanitizeBlockMediaUrls`; `validateBlockMediaUrls` takes `(json, ctx)`. `json/trusted-media-domains.json` and `trustedMediaDomains` are gone: stored blocks with external image URLs render nothing, and a save that contains one answers 400.
30. App creates behind `checkIdempotency` filter on `createdBy`.
31. Rename `loadActiveTenant` to `loadTenant`; treat an unknown tenant as 403 and an unreadable product or channel as 404 (`cella/PERMISSIONS.md`, Refusals).
32. Frontend row affordances pass the row's home to `resolveCan(permission, createdBy, actorId, home)`: a non-elevated role's grant covers rows homed at its own channel only, as on the server.
33. Replace `findMembershipAwareRows` with `findInvitationAccounts` and `findInvitationsToAddresses`; pass `canResend` to the pending table's `useColumns`.
34. Replace the SDK `Membership` type with `UpdateMembershipResponse`, merge or guard these responses before an own-membership cache (as `frontend/src/modules/memberships/query-mutations.ts` does), and pass other users' memberships from app routes through `membershipAsSeenBy`.
35. Test cleanups that delete memberships before their organizations run in one transaction (the last-admin trigger).

**Realtime**

36. Pass `organizationId` to `CollaborativeBlockNote`; drop `YjsTokenFetcher` and `collaborativeProduct`; an app's own `PersistQueryClientProvider` passes `shouldPersistQuery` (`~/query/persister`) as `shouldDehydrateQuery`. Relay code calls `broadcastToCollab(session, message)` with the session `joinCollab` returns.
37. App materializers refuse with a 403 or 404 `AppError`; custom Yjs clients treat close code 1011 as transient and 4400 as final, and handle the relay's generation message (`yjs/README.md`). A description written outside the relay calls `retireYjsDocuments` in the same transaction.
38. App pools pass the parsed `DEBUG` flag to `createPgConnection(url, { debug })`, which decides the query logger; `dbConfig` is gone.

**Telemetry, email and limits**

39. Import `scrubUrl` from `shared/utils/scrub-url` and add app token routes to `secretPathTemplates` or `sensitiveQueryKeys`; pass `redactPaths` to every `createLogger`; log queries on `pgDetail` find nothing any more (use `pgCode` and `pgConstraint`).
40. Email templates: keep markup in the translation string, spread `plainText` on text outputs, name params with `param('<key>')`, and declare HTML params in `htmlParams`; replace module-load `t()` calls in schemas with `translatedError(key)`.
41. Newsletter links use `buildUnsubscribeLink(userId, 'newsletter')`; `/me/unsubscribe` and `unsubscribe_tokens` are gone. Pass `since` to `buildDigestForUser` and `findUndigestedNotifications`, and the recipient's language to `renderSectionsHtml`; apps with extra languages translate the new locale keys.
42. Replace imports of `StaticDocumentBody`, `BlockNoteMinimalHtml` and `sanitizeUrl`.
43. Fake limiter stores in app tests are a `RateLimiterMemory` per prefix (`rate-limiter/tests/memory-stores.ts`); an app that passed `onBlock`, imported `slowOptions` or read a limiter's `points` uses `reserveTiers`/`settleTiers` (`rate-limiter/tiers.ts`) and `handler.buckets`.

**Removed**

44. Replace `deleteUser` with `deleteAccounts` (`user/helpers/delete-accounts`); `findUserByEmail` loses `verifiedOnly` (every stored address is proven); `withinTimeout` returns the failure or `undefined`; test fixtures lose their `verified` argument and `verifyUserEmail`; `getHealthResponse` with the exported `healthApp`, and `StaleDocRow` with `DocScope`; drop `findExistingRequest`, `getEntityByTransaction`, `findActivityRefByMutationId` and `verifyEmail`. An app that still throws `request_email_is_user`, `request_exists`, `token_not_found` or `sync_unavailable` adds the key to its own locale.

## Verify

```sh
pnpm --filter backend generate
pnpm vitest run --project=backend backend/tests/security
pnpm check
```
