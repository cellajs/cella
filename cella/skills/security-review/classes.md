# Vector classes

One class is one review iteration. The scout verifies every path below at the reviewed commit before anyone attacks, because paths move. "Holds" names files in `backend/tests/security/` unless a path says otherwise. The advisory counts come from the intake of 2026-10-28 (362 advisories over 176 direct dependencies). Paths were last verified on 2026-10-29 at main 99b66bbbd (A5, B1, C1, C3, C4, C5 at ddf0595aa; A6, B4, B5, C7, C8, D1 at c19b4138c). In Files, `backend/src/modules/auth/` is written `auth/` where a bullet starts from it.

## A. Who acts

### A1 Token and link lifecycle
- **Gain:** account takeover.
- **Merges:** replay, a link opened in another browser, expiry, single-use races, hash-only storage, randomness and length, every carrier (magic, invitation, oauth-verification, confirm-mfa, oauth-connect, step-up code, unsubscribe).
- **Advisories:** 9 (nanoid predictability and looping on bad sizes).
- **Files:**
  - `backend/src/modules/auth/tokens/`: `token-lifecycle.ts`, `token-policies.ts`, `tokens-queries.ts` (the compare-and-set), `tokens-db.ts`, `operations/open-link-token.ts`, tests `token-lifecycle.test.ts`, `token-policies.test.ts`.
  - Token types in `shared/config/config.default.ts` (and `config.template.ts`): six, `oauth-verification, invitation, confirm-mfa, magic, oauth-connect, step-up`; policies are exhaustive through `satisfies Record<TokenType, TokenPolicy>`.
  - Issuers: `auth/magic/operations/send-magic-link.ts`, `auth/oauth/operations/send-oauth-verification-email.ts`, `auth/oauth/oauth-handlers.ts` (connect pin), `auth/mfa/operations/mfa-challenge.ts`, `auth/step-up/operations/send-step-up-code.ts`.
  - Invitation issuers: `auth/invitations/operations/{resend-invitation,confirm-invitation-address}.ts`, `modules/system/operations/create-invite.ts`, `modules/memberships/operations/create-memberships.ts`, `deferred-invites.ts`.
  - Spenders: `auth/sessions/operations/sign-out.ts`, `auth/mfa/operations/mfa-challenge.ts`, `auth/passkeys/passkeys-handlers.ts`, `auth/oauth/operations/{spend-connect-pin,handle-oauth-callback}.ts`, `auth/general/general-handlers.ts` (invitation), `auth/step-up/step-up-handlers.ts`.
  - Unsubscribe: `modules/notification/helpers/category-token.ts`, `operations/unsubscribe.ts`, routes in `notification-routes.ts`.
  - Other random sources: `auth/passkeys/operations/passkey-challenges.ts` and `auth/totps/totps-handlers.ts` (A3), `modules/service-accounts/helpers/api-key.ts` (A5), `lib/mailer.ts` (CSP nonce).
- **Holds:**
  - `magic-link`: replay of an opened link through another link's cookie, sign-in from a browser that did not ask, a mail scanner using the link up, a planted link while signed in, sign-up for someone else's address.
  - `sign-out-magic-link`: the next person at a shared computer reopening the owner's link. `sign-out-mfa-challenge`: a session kept alive through a challenge at sign-out.
  - `totp-replay`: a replayed code at sign-in, step-up and setup, and two sessions from one code at once (A3 scope).
  - `unsubscribe-tokens`: a link for another user or category; GET changes nothing, POST turns off.
  - `auth/tokens/token-lifecycle.test.ts`: hash-only storage, replacement rules, browser binding, unknown or expired tokens, two concurrent confirm-mfa spends (exactly one wins), spend through the single-use cookie, rollback keeps the token.
  - `backend/tests/invitations/*`: replay after accept, a token bound to another user, the single-use cookie, expiry, two racing sessions, another invitation's data.
  - Two auth-1 removals re-verified at HEAD in `removed-protections.json`.
- **Asks:** one table, token type x (issue, open, spend, expire, revoke with its session, race, other account) -> the line that enforces it and the test; where each random value comes from (`crypto` or nanoid) and its length.
- **Not this class:** session cookie, MAC and fixation belong to A2. TOTP, passkey and MFA factor verification belong to A3. Provider sign-in and callback state belong to A4. API keys, access tokens and signing keys belong to A5. Invitation-address takeover and cross-site GET per type belong to C7. Secrets at rest and logs belong to D1.

### A2 Sessions and cookies
- **Gain:** account takeover.
- **Merges:** the cookie MAC, attributes, injection through a name or attribute value, fixation at sign-in, the session cap, sign-out ending the stream and the cache entry, impersonation, last-seen, session cache races.
- **Advisories:** 5 (hono cookie name and attribute injection, NBSP prefix on read).
- **Files:**
  - `backend/src/modules/auth/general/helpers/cookie.ts`: the only module importing `hono/cookie` (`setCookie`, `getCookie`, `deleteCookie`).
  - `backend/src/modules/auth/sessions/`: `operations/{create-session,resolve-session,sign-out,impersonation,revoke-sessions}.ts`, `helpers/sign-in-context.ts`, `sessions-queries.ts`, `session-listeners.ts`.
  - `backend/src/middlewares/guard/session-cache.ts` (TTL 10 s), `backend/src/middlewares/update-last-seen.ts`.
  - Other session writers: `modules/me/me-handlers.ts`, `modules/me/operations/{revoke-my-sessions,toggle-mfa}.ts`, `modules/user/operations/delete-accounts.ts`, `modules/entities/entities-listeners.ts`, `modules/entities/operations/stream-session-sweep.ts`.
  - `backend/src/modules/oauth-server/provider.ts`: oidc-provider's own cookies, signed with `cookieSecrets`.
  - `backend/src/utils/hash-token.ts` (session lookup by SHA-256 of the token) and `shared/src/utils/safe-equal.ts` (hash both sides, then `timingSafeEqual`).
  - `cella/authentication/SESSIONS.md`. The `Set-Cookie` mentions in `auth/{oauth,totps,passkeys,general}/*-routes.ts` are OpenAPI header documentation only.
- **Holds:**
  - `cookie-integrity`: an unsigned cookie, a value signed for another cookie name, a past max age, a foreign secret.
  - `session-model`: a forged secret via a cached session id, the stored hash replayed as a cookie, an expired session via a warm cache, a failed lookup that must not sign out, a forged `adminUserId` at stop.
  - `session-cache-race`: a revoked session kept by an in-flight lookup.
  - `session-endings`: sign-out, revoke from another device, MFA on, cap eviction, same-browser replace, stopped impersonation, deleted account; the open stream and cache entry die with the session.
  - `session-sweep`: a session revoked on another instance, expired, user deleted outside the API, impersonation whose admin lost session or role.
  - `impersonation` (cookie without the admin session, disallowed address, no second impersonation, role loss) and `impersonation-last-seen`.
  - `tests/sign-in/session-cap` (oldest beyond the cap evicted) and `tests/sign-in/sign-out` (a forged cookie naming the victim's session id revokes nothing).
  - `auth/tokens/token-policies.test.ts`: SameSite per policy.
- **Asks:** every `setCookie` call's name and attribute values against the five advisories (does any value come from a request?); a new session id at sign-in; what a stolen cookie does after sign-out.
- **Not this class:** session cache correctness and the 10 s window belong to C8. Slot caps on the relay and stream belong to C1 and B5. Step-up and MFA proofs belong to A3. Token types, magic links and invitations belong to A1. Device-id PII hashing and log redaction belong to D1. `X-Forwarded-For` for the sign-in address belongs to A6. CSRF and Origin on the cookie routes belong to C7.

### A3 Second factors and step-up
- **Gain:** account takeover.
- **Merges:** WebAuthn verification (origin, rpId, one purpose and one answer per challenge, counter, attestation), TOTP (encrypted secret, lockout in every process, replay), the step-up window and its methods, the factor race, MFA on and off, the lost-factor path, no step-up under impersonation.
- **Advisories:** 1 (simplewebauthn attestation chain).
- **Files:**
  - `backend/src/modules/auth/{passkeys,totps,mfa,step-up}/`. `auth/mfa` has no routes file: `mfa-queries.ts`, `operations/{factor-rules,mfa-challenge}.ts`; the toggle route is in `me-routes.ts` with `modules/me/operations/toggle-mfa.ts`.
  - `backend/src/middlewares/guard/step-up-guard.ts`: three guards, `stepUpGuard` (account), `stepUpFactorGuard` (factor), `stepUpEnrollGuard` (enroll).
  - `verifyRegistrationResponse` and `verifyAuthenticationResponse` are called only in `auth/passkeys/`; `verifyPasskeyAssertion` callers: `passkeys-handlers.ts`, `mfa-challenge.ts`, `step-up-handlers.ts`.
  - `verifyTotp` callers: `mfa-challenge.ts`, `step-up-handlers.ts`, `totps-handlers.ts` (setup).
  - `requireStepUp` outside the guards: `modules/oauth-server/interactions.ts` (consent), `modules/service-accounts/operations/update-service-account.ts` (re-enable); `readStepUp` in `toggle-mfa.ts`, `send-step-up-code.ts`, `step-up-handlers.ts`.
  - Stamp writers: `updateSessionSteppedUp` in `auth/sessions/sessions-queries.ts` (called from `passkeys-handlers.ts`, `totps-handlers.ts`, `step-up-handlers.ts`); `setUserSession(... steppedUpVia)` in `mfa-challenge.ts` and `toggle-mfa.ts`.
  - Sign-in without an MFA challenge: `finish-sign-in.ts` runs `initiateMfa` for magic and provider sign-in; a passkey sign-in sets the session at once (documented in `AUTHENTICATION.md`).
- **Holds:**
  - `passkey-challenges`: a reused sign-in challenge, a sign-in challenge answering MFA, another account's passkey on MFA, a stale counter, a clone whose counter moved during verification, another account's credential id on registration.
  - `passkey-verification`: wrong challenge, foreign origin, foreign rpId, user presence without verification, a signature of another key.
  - `mfa-challenge`: a second session via a completed challenge's cookie; a wrong factor keeps the challenge open.
  - `totp-replay`: a replayed code on MFA, a sign-in code reused as step-up, a setup code reused as second factor, one code sent twice at once.
  - `brute-force-limits`: guessing codes via `/auth/step-up`, many accounts from one address, one account from many addresses, a lockout ended in the database but still held in a process.
  - `step-up`: a sign-in or MFA passkey response used as step-up, a wrong code, impersonation with a factor or emailed code, a code mailed to another session, no mail code with MFA on.
  - `step-up-routes`: stale session, impersonation, another session's step-up, expired window, recent sign-in without a held factor, SSO without MFA, for every guarded route.
  - `step-up-db-failure`: a pool timeout or deadlock answers 503 or 409, never a 401 that counts as a wrong code, and stamps nothing.
  - `mfa-factor-race` (factor delete racing the MFA toggle), `mfa-step-up` (the toggle needs step-up, MFA on needs both factors, an SSO session cannot turn MFA on).
  - `tests/sign-in/{totp,passkey}` (another user's passkey id on delete, a second key refused); `tests/sign-in/devices*` and `device-id` cover new-browser notices and device cookies.
- **Asks:** the WebAuthn L3 verification steps as a checklist against the `@simplewebauthn/server` options; the step-up-routes table against the AUTHENTICATION.md table.
- **Not this class:** session cookie MAC, fixation and `setCookie` values belong to A2, including the `totp-challenge` cookie signing and name binding. The `sso` stamp, `email_verified` and the connection id through MFA belong to A4. Machine tokens, API key hashing and OAuth consent contents belong to A5 (the step-up on them is table 2). Secrets in logs and `DATA_ENCRYPTION_KEY` handling belong to D1. The rate limiter store shape belongs to C8.

### A4 Provider and institutional sign-in
- **Gain:** account takeover.
- **Merges:** state, nonce, PKCE, id_token verification, which provider claims are trusted (`email_verified`), account linking and its 409 family, the verification mail, every `ctx.redirect` target, SAML and OIDC federation (assertion signature, audience, replay, metadata trust), the tenant sign-in policy.
- **Advisories:** none.
- **Files:**
  - `backend/src/modules/auth/oauth/`: `oauth-handlers.ts`, `oauth-routes.ts`, `oauth-schema.ts`, `identities-{db,queries}.ts`, `helpers/{providers,code-flow,oauth-cookie,transform-user-data}.ts`, `operations/{provider-round-trip,handle-oauth-initiation,handle-oauth-callback,handle-oauth-verification,send-oauth-verification-email,spend-connect-pin}.ts`.
  - `backend/src/modules/auth/sso/`: `sso-routes.ts`, `role-from-claims.ts`, `helpers/{federation-client,federations,federation-keys,transform-sso-claims}.ts`, `operations/{start-sso,sso-callback,complete-sso-sign-in,connect-sso-identity,provision-sso-user,sso-recovery,insert-sso-membership,get-sso-entry,list-sign-in-federations}.ts`.
  - `backend/src/modules/connections/`: routes, queries, `operations/{create,update,delete,get,assert-claim-values-free}`.
  - Tenant strategies: no tenants strategy module; the policy field is `tenants.authStrategies` in `modules/tenants/tenants-db.ts`, enforced in `backend/src/middlewares/guard/tenant-guard.ts`.
  - Redirect: `backend/src/lib/error.ts` (redirect handling).
  - Docs: `cella/AUTHENTICATION.md`, `cella/authentication/SSO.md`.
  - Routes: social starts and callbacks use `publicGuard` with `tokenLimiter` on callbacks; SSO routes are all `publicGuard`; connections CRUD uses `userGuard, sysAdminGuard, tenantGuard`.
  - Tests live at: `backend/tests/sign-in/{oauth,sso,sso-policy}.test.ts`, `backend/tests/sso-federation-client.test.ts`, `backend/tests/connections.test.ts`, `backend/tests/invitations/claim-on-signup.test.ts`, `backend/tests/security/oauth-connect.test.ts`.
- **Holds:**
  - Login CSRF and injected callback: `oauth` (invalid state, no state cookie for each provider; the cookie must name the same provider).
  - Authorization code swap: `oauth` (PKCE binding), `sso-federation-client` (S256 and nonce in the URL).
  - Forged or replayed id_token: `sso-federation-client` (other nonce, other client, userinfo of another subject; a rejected code forgets discovery). The nonce check for social sign-in is the oauth4webapi `expectedNonce` in `auth/oauth/helpers/providers.ts`.
  - Implicit linking by address: `oauth` (an address that matches a local user without identity gives 409, connect to another user's address gives 409, a provider account of another user).
  - A signed-out sign-in moving a verification to another inbox: `oauth`.
  - Connect to a victim account via forged state or stale pin: `oauth-connect`, `oauth`.
  - An account from an unproven address (OAuth sign-up, invite): `oauth`.
  - Wrong institution or domain: `sso` (institution not accepted, no address, provisioning off, another user's identity without pin). Recovery abuse: `sso`.
  - Tenant policy: `sso-policy` (a member's identity bound however they signed in, no magic link to an institution-proven address).
  - Connections admin: `connections` (non-sysadmin and sso off, domain uniqueness).
  - Claim on proof: `invitations/claim-on-signup` (claims bind only to the proven account).
  - Redirect: `oauth` (an attacker `redirectAfter`), plus the `shared` safe-redirect unit tests.
- **Asks:** the RFC 9700 client checklist per provider; a table of trusted claims; a table of redirect targets and their origin (all build on `appConfig.frontendUrl` today); federation metadata refresh and signature.
- **Not this class:** machine tokens, the OAuth server, consent and the `oauth-grants` test belong to A5 (that test covers the OAuth server, not provider sign-in). Sessions, MFA, step-up after sign-in and the device cookie belong to A2 and A3. Invitation-address takeover through the confirmation link belongs to C7. Magic-link mechanics belong to A1. Log content of federation refusals belongs to D1. The discovery fetch (`oauth-metadata-fetch-*` tests) belongs to C5.

### A5 Machine proofs and the authorization server
- **Gain:** token forgery, so everything a tenant holds.
- **Merges:** `jwtVerify` options (algorithms, audience per tenant, issuer, clock tolerance, typ), the JWK set and the `next` -> `current` -> `retired` promotion that nothing runs today, API key hash and prefix, scope masking, `client_credentials`, consent, the token-grant cache after a revocation, the CSRF skip that covers API keys but not bearer tokens (AUTH_SUBSTRATE section 1), a key sent with a browser `Origin`, the tenant-of-key check before any lookup.
- **Advisories:** 6, plus 2 pattern lessons (jose padding oracle, hono JWT scheme and NumericDate; pattern: hono algorithm confusion x2).
- **Files:**
  - `backend/src/modules/oauth-server/` (not under `auth/`): `keystore.ts` (mint, ensure, load private set, public set), `verify-access-token.ts` (the only `jwtVerify`), `adapter.ts` (hashes `AuthorizationCode` and `RefreshToken` ids; service accounts are their own clients), `interactions.ts` (consent routes), `provider.ts`, `grant-policy.ts`, `revoke-grant.ts`, `server.ts`, `signing-keys-db.ts`, `resources.ts`.
  - The `oauth` worker: `backend/src/modules/oauth-server/worker/oauth-worker-entry.ts` (calls `ensureSigningKeys`, then `createProvider`; started in-process by the API under singleVM).
  - `backend/src/modules/service-accounts/`: `helpers/api-key.ts`, `operations/{issue,create,revoke}-api-key.ts`, `service-accounts-queries.ts`.
  - `backend/src/middlewares/guard/`: `service-guard.ts`, `token-guard.ts`, `actor-guard.ts`, `api-key-cache.ts`, `token-grant-cache.ts`, `invalidate-cache.ts`.
  - `jose` is imported in `verify-access-token.ts` (verify), `keystore.ts` (mint and local set), `signing-keys-db.ts` (type). The `mcp/` package holds no jose, jwt or Bearer code; MCP tokens are checked in the backend `tokenGuard`.
  - Tests: `backend/tests/{oauth-server,service-accounts,mcp,mcp-worker}.test.ts`, `backend/src/modules/mcp/mcp-{server,tools}.test.ts`, `backend/src/middlewares/guard/{token-guard,api-key-cache}.test.ts`, `backend/tests/auth-strategies/{enforcement,route-strategies}.test.ts`.
- **Holds:**
  - `token-guard.test.ts` (`it.each(forgeries)`): other issuer, expired, another organization's audience each give 401 and set no actor, with a positive control.
  - `api-key-scope`: a read-only key cannot mint write scopes through `client_credentials`.
  - `oauth-metadata-fetch-limit`: bounds metadata document and sector fetches per address.
  - `route-guards`: each route's guard chain. `csrf`: cross-site form posts are refused.
  - `oauth-server.test.ts`: a wrong client secret, a resource outside the deployment (`invalid_target`), a token acts as the service account masked by scopes, revoking a connected app revokes its tokens.
  - `service-accounts.test.ts`: a revoked key gives 401, a browser Origin gives 403, a foreign tenant gives 403 (guard order puts `tenant-guard` before the tenant lookup), roll overlap, expiry boundary, a disabled account with a cached key, revoke through another account, an account without a grant at the tenant door, only the hash is stored, the list never shows the hash.
  - `api-key-cache.test.ts`: an account drop empties its keys, an in-flight read at the drop stores nothing, unknown keys are never cached.
  - `mcp.test.ts`: a tokenless call gets the RFC 9728 challenge, a call outside scope is refused per call; `token-guard.test.ts`: an API key on the MCP face is no token.
  - `auth-strategies/*`: tenant sign-in policy against `actor.authStrategy` (tokens carry `auth_strategy`); A4 policy tests, cited here for the token path.
  - In code: key shape and CRC reject typos before a lookup (`api-key.ts`); the `Origin` refusal and live grant reads in `service-guard.ts`; `isSystemAdmin` false for every machine proof; `client_secret_basic` and `none` only, PKCE required (`provider.ts`).
- **Asks:** the verify options as a table; a forged token under each wrong option; the CSRF skip decision; a token used after its grant or key is revoked, within the cache TTL; the rotation gap.
- **Not this class:** session cookie signing and the session cache belong to A2. Magic link and invitation token lifecycle belong to A1. `hash-pii`, TOTP and cookie helpers in `backend/src/utils` belong to A2 and A3. The Yjs upgrade token belongs to B5. MCP tool-level reads and writes belong to B6. Request-size caps on tokens and the metadata fetch size belong to C1. The metadata document fetch belongs to C5. IP-based trust for the system admin belongs to A6. Provider-side OIDC sign-in with `oauth4webapi` belongs to A4.

### A6 Address-based trust
- **Gain:** system admin from a spoofed address.
- **Merges:** `SYSTEM_ADMIN_IP_ALLOWLIST` through `ipRestriction`, where the client address comes from behind the load balancer (which forwarded header, set by whom), the internal listener's peer check (`internalSourceRefusal`), rate-limiter keys by address, geoip, request details in mails.
- **Advisories:** 3, plus 1 pattern lesson (hono `ipRestriction` IPv4-mapped IPv6, non-canonical IPv6, IPv4 bypass; pattern: spoofed connection info).
- **Files:**
  - `backend/src/middlewares/guard/sys-admin-guard.ts` (the one `ipRestriction` use).
  - `backend/src/lib/listeners.ts` (`internalSourceRefusal`), `backend/src/lib/request-details.ts` (country, browser, os; no address), `backend/src/lib/geoip.ts`, `backend/src/middlewares/rate-limiter/` (`helpers.ts`, `core.ts`).
  - Added files: `backend/src/utils/get-ip.ts` (the one function that yields the client address), `backend/src/utils/system-access.ts` (allowlist parsing and `isSystemAccessAllowed`), `backend/src/utils/ip-subnet.ts` (`toRateLimitIp`, `isPublicIp`, `unmapIPv4`).
  - Other call sites: `middlewares/guard/user-guard.ts` (sets `isSystemAdmin`), `modules/auth/sessions/operations/{resolve-session,create-session}.ts`, `modules/entities/entities-handlers.ts` (reports `systemAccessAllowed`), `modules/mcp/mcp-tools.ts` (copies `x-forwarded-for` and `authorization` into the in-process request), `modules/oauth-server/interaction-policy.ts` (rebuilds a Context from `cookie`, `x-forwarded-for` and the node socket).
  - Infra: `infra/caddy/Caddyfile` is the SPA proxy and reads no client address; the API VMs sit behind the Scaleway load balancer (`infra/resources/loadbalancer.ts`, `forwardProtocol: 'http'`, no proxy protocol); VMs take no inbound (`infra/resources/compute.ts`, `inboundDefaultPolicy: 'drop'`); internal frontends admit private-network sources only.
- **Holds:**
  - `backend/src/utils/get-ip.test.ts`: forged left-most entries ignored, `x-real-ip` ignored, rightmost entry, trimming, null.
  - `system-admin-ip`: a session cached from the allowlisted address gives no system scope from another (`x-forwarded-for` varied), and the reverse order.
  - `internal-listener`: a public peer is refused on every route and on the CDC upgrade, secret or not; the public listener and dot-segment paths cannot reach the internal routes.
  - `backend/tests/emails/request-details.test.ts`: request details appear only in mail about the recipient's own action, never the inviter's.
  - `backend/src/utils/ip-subnet.test.ts`: mapped and differently spelled forms share a bucket; private, loopback and ULA are not public.
  - The VMs drop all inbound, so no client reaches the API without the load balancer.
- **Asks:** one function that yields the client address, its inputs per deployment (load balancer, dev, test), and a test with a forged forwarded header; canonical form of allowlist entries; the hono version minimum for the three fixes.
- **Not this class:** rate-limit budgets per route belong to E1. Header and body parsing differentials belong to C7. The CDC and relay shared secrets after the peer check belong to the class of their module (B5 for the relay). Network ACLs, security groups and load balancer IAM belong to the infra review (F3).

## B. What they may do

### B1 Object-level access across every read path
- **Gain:** cross-tenant read.
- **Merges:** cross-tenant and cross-organization reads, 404 against 403, home scoping and elevated roles, drafts, public read, nullable ancestors, the RLS backstop as `runtime_role`, the system-admin bypass in lists, catchup views, Yjs document to entity, MCP tool reads, counters and member previews, `getUsers` search, activities, notifications, `relatableGuard`.
- **Advisories:** none.
- **Files:**
  - The engine: `shared/src/permissions/` (`check-access.ts`, `engine/check.ts`, `engine/resolve-access.ts`, `public-read.ts`, `row-conditions.ts`, `access-scopes.ts`).
  - `backend/src/permissions/`: `get-valid-product.ts`, `get-valid-channel.ts` (re-exported by `index.ts`), `row-predicates.ts` (`buildCollectionReadWhere`), `collection-scope.ts`, `split-by-permission.ts`, `view-read-status.ts` (`resolveViewReadStatus`), `channel-collection-scope.ts`.
  - `backend/src/db/tenant-context.ts` (`tenantRead`, `tenantReadAs`, `tenantReadUnlessInTransaction`).
  - `backend/src/modules/entities/entities-queries.ts`; `backend/src/modules/memberships/helpers/member-counts.ts`; `backend/src/middlewares/product-cache/product-cache.ts`.
  - `backend/src/modules/entities/helpers/dispatch-to-stream.ts` (dispatch and read decisions) and `entities/stream/` (`send-signal.ts`, `audiences.ts`, `build-change.ts`, `subscriber-manager.ts`).
  - `backend/src/modules/mcp/` (`mcp-tools.ts`, `mcp-server.ts`, `mcp-routes.ts`; no read code of its own); `backend/src/modules/yjs/operations/authorize-yjs-editor.ts` (the document-to-entity access check); `shared/src/utils/yjs-token.ts` (B5).
  - `getUsersOp` in `backend/src/modules/user/operations/get-users.ts`, query in `user-queries.ts`; `backend/src/middlewares/guard/relatable-guard.ts`.
  - Activities: no read route; the table is read only for a cursor id in `entities-queries.ts`.
  - Callers: `getValidProduct` in `modules/attachment/operations/{get-attachment,update-attachment,link-attachment-keys}.ts` and `authorize-yjs-editor.ts`; `getValidChannel` in organization, memberships (`get-members`, `get-pending-memberships`, `check-invites`, `create-memberships`, `delete-memberships`, `update-membership`, `resend-pending-invitation`, `withdraw-pending-invitation`) and service-accounts operations; `resolveCollectionReadFilter` in the attachments list, `get-unseen-counts.ts`, `mark-seen.ts`, `propagation-hints.ts`, `view-read-status.ts`; `splitByPermission` in `delete-attachments.ts`, `delete-organizations.ts`; `filterExistingProductIds` in `entities/embedding-queries.ts`; `checkAccessFanout` in `notification/operations/fan-out.ts`.
  - The template has one product (attachment) and one channel (organization); `buildChannelListReadWhere` and `resolveChannelCollectionReadScope` have no caller in `backend/src` outside tests.
- **Holds:**
  - `cross-tenant`: a user of tenant A listing or reading tenant B attachments and organization, or signing tenant A's attachment from B's session.
  - `cross-org`: routes on tenant A's path naming org B ids (404), a batch delete naming a foreign id, `getUser`/`getUsers` outside a shared org, a cache warmed on org A's path served on org B's.
  - `defense-in-depth`: `getOrganizations` leaking another tenant's organization. `product-existence`: 404 for a missing and an unreadable id, 403 only for a readable row.
  - `backend/src/permissions/{get-valid-product,get-valid-channel,split-by-permission,row-predicates,view-read-status}.test.ts`: foreign-tenant and foreign-organization rows read 404; a draft channel for a non-member; a bulk call acting on another author's draft; engine, SQL and dispatch agreeing on every row across random policies; forged prefixes and cross-org claims on counters.
  - `entities/stream/dispatch-mirror.test.ts`, `entities/helpers/dispatch-eligibility.test.ts`: a stale topic registration after membership removal, a reader of only a non-first row, a malformed membership poisoning a batch, batch against single decisions.
  - `entities/operations/app-catchup.test.ts`, `tests/catchup-baseline`, `tests/catchup-propagation`: a view outside memberships leaking numbers, a forged prefix, a hint naming an unreadable row.
  - `notification-access`: inbox, instant mail and digest naming a left organization's items. `mark-seen`: confirming a deleted or hidden attachment.
  - `relatable-organizations`, `user-list-system-role`, `member-personal-view`, `archived-tenant`, `tenant-access`.
  - `yjs-token` and `tests/yjs-http`: token or pull/push for an entity the caller may not update; `tests/mcp` and `mcp-server.test.ts`: a call outside scopes.
  - `tests/integration/rls-security`: attachment reads across tenants and without tenant context as `runtime_role`; `tests/integration/schema-verification`: channel tables have no RLS, composite FK on product tables.
  - `permission-engine-boundary`: any file but `check-access.ts` importing `getAllDecisions`. `tests/channel-discovery` (contract test). `route-guards`. `tests/organization-member-previews` (at most 3 previews, only `UserMinimalBase` fields). `pnpm test:core:runtime`.
- **Asks:** PERMISSIONS.md's rule "any grant the single-row path honours must appear in lists and over SSE" as a table: path x grant source (membership, relation, public, systemAdmin, draft) -> the test. The paths to cover: single row, list, SSE, MCP tools, counters, member previews, search, activities, Yjs, catchup.
- **Not this class:** role escalation, last admin and invitations belong to B2. Which fields a reader sees (`membershipAsSeenBy`, `mfa`, system `role`, secret columns, email in user lists) belongs to B3. Stream fan-out mechanics (subscriber caps, membership refresh timing, session close, signals) belong to B4; the disclosure question stays here. Yjs token lifecycle and claims belong to B5. MCP token audience, scopes and consent belong to B6. The client-address and system-admin allowlist belong to A6.

### B2 Roles and function-level access
- **Gain:** escalation inside a tenant.
- **Merges:** role escalation on a membership update, the last admin, invitations (role against the inviter's, resend, pending, rejected, draft), the service-account role cap and bindings, `system_roles` written by the admin connection only, the system role in user lists, tenant lifecycle actions, impersonation scope, app-defined roles (`elevated`, `prepareRoles`).
- **Advisories:** 2 (hono improper authorization, JWT scheme).
- **Files:**
  - `backend/src/modules/memberships/` (also holds the invitation routes in `memberships-routes.ts`).
  - `backend/src/modules/auth/invitations/operations/{accept-invitation-token,confirm-invitation-address,get-token-data,may-sign-up,resend-invitation}.ts`.
  - `backend/src/modules/service-accounts/`, `backend/src/modules/system/` (`system-schema.ts` has no role field; `system_roles` has no app writer, only seeds and migrations: `backend/scripts/seeds/00-init.seed.ts`, `backend/scripts/migrations/10-rls.migration.ts`), `backend/src/modules/tenants/`.
  - Guards in `backend/src/middlewares/guard/`: `sys-admin-guard.ts`, `relatable-guard.ts`, `tenant-guard.ts`, `user-guard.ts`, `step-up-guard.ts`.
  - `shared/config/hierarchy-config.ts`.
  - Call sites: `startImpersonation` in `auth/general/general-routes.ts`; `deleteMyMembership` in `me/me-routes.ts` and `me/operations/delete-my-membership.ts`; account deletion in `user/operations/delete-accounts.ts` (last admin by cascade).
- **Holds:**
  - `last-admin`: demote, remove, leave, delete the account, two admins removed concurrently: all 409 `last_admin`, with a positive control.
  - `membership-update`: a member cannot promote self. `permission-enforcement`: a member session cannot update the org, invite as admin, resend or delete memberships.
  - `pending-invitations`: no account oracle on list, resend, invite, check; a member cannot withdraw. `rejected-invitations`: a declined invitation cannot be accepted by id, token or inbox proof. `resend-invitation`: no re-mint of rejected, revoked, accepted or used invitations.
  - `tests/invitations/*`: draft invites held, only `prepareRoles` dispatch, a member cannot publish; invite and accept flows.
  - `tests/service-accounts`: a member cannot create an account, key scopes mask grants, revoke through another account, no grant at the tenant door, quota.
  - `tests/integration/system-roles-write-guard`: `runtime_role` cannot insert, update or delete `system_roles` even with the grant open; the admin connection and the user-delete cascade still work.
  - `impersonation`: the cookie alone does nothing, a second impersonation is refused, it ends with the admin session or role.
  - `user-list-system-role` (B3 field visibility, listed because the plan names it); `tests/system-update-user`; `tests/tenants`.
  - The frontend parity test of the `can` map.
- **Asks:** every write that carries a role or a binding, who may set it and the cap, as a table; the parity test under an app's hierarchy.
- **Not this class:** field visibility of `role` and the system role in user lists belongs to B3. Cross-tenant and object reads belong to B1. Invitation address takeover belongs to C7. API key hashing and token signing belong to A5. Session cache and bindings cache staleness belong to C8. SSE and catchup grants belong to B1 and B4.

### B3 Property-level access
- **Gain:** secret exposure, integrity.
- **Merges:** mass assignment (the body pick), the writable set per update route, the secret-column registry (responses, logs, the CDC row image), visibility by relation (the MFA setting, the personal view, addresses of organization members, invited addresses), `included` membership, activities `changedFields`, base against full schemas.
- **Advisories:** none.
- **Files:**
  - `backend/src/db/secret-columns.ts`: the registry (api_keys.hash, oauth_clients.secretHash, passkey_challenges.challengeHash, sessions.secret, signing_keys.privateJwk, tokens.secret and singleUseToken, totps.secret), the allowed look-alikes and the pattern.
  - `withActorRefs` in `backend/src/modules/actors/actor-refs.ts` (single-row `withActorRef`); output is `ActorRef` (id, kind, name, slug, thumbnailUrl; no email).
  - `backend/src/modules/activities/` (`activities-db.ts`, `activities-schema.ts`, mocks, module; no route reads it). Readers: `backend/src/lib/cdc-websocket.ts` and `modules/entities/entities-queries.ts` (selects `id` only).
  - Every `*-schema.ts`.
  - Tests: `backend/tests/security/{mass-assignment,response-secrets,user-mfa-visibility,member-personal-view,profile-image-urls,trace-redaction}.test.ts`; `cdc/src/tests/secret-columns.test.ts`.
- **Holds:**
  - `mass-assignment`: `updateMe` with `email` and `mfaRequired` beside `firstName`, `updateOrganization` with another `tenantId` and `createdBy`; the row keeps both.
  - `response-secrets`: nine routes searched for every stored value of a secret column and every secret column name.
  - `user-mfa-visibility`: a co-member and an admin of another org reading `mfaRequired` on `getUser` and `getMembers`; the field is absent without `include=mfa`.
  - `member-personal-view`: another member's archive, mute and order in `getMembers`; pins that email is shown org-wide.
  - `profile-image-urls`: an avatar or banner pointed at another host. `trace-redaction`: a token in a request span and in the request log line (D1).
  - `cdc/src/tests/secret-columns.test.ts`: a new column matching the secret pattern in neither map.
- **Asks:** per update route the writable columns against its schema, read from the OpenAPI document as request-bodies.test does; per response schema the fields and the relation that may see them; the values `changedFields` carries.
- **Not this class:** the role ceiling on `membershipInvite`, `createServiceAccount` and `updateMembership` belongs to B2. `welcomeText` and description media URLs (`assertBlockMediaUrls`) belong to C4. HLC `fieldTimestamps` and `replayed` in `stx` belong to C1. Row reach of getMembers, getUsers and getUser belongs to B1. Invitation-address takeover belongs to C7.

### B4 Stream fan-out
- **Gain:** cross-tenant read by fan-out, denial of service.
- **Merges:** `accessDecisions` per change and per signal, a change sent too wide, a signal's ids as an existence leak, a membership change mid-stream, a session end closing the stream, the stream sweep, CR or LF in `frame.event` and `id` passed to `writeSSE`, the subscriber cap (`streamConnectLimiter`), catchup frontiers (`opaque`, `forbidden`), propagation hints, the `pg_notify` payload.
- **Advisories:** 1 (hono SSE control-field injection through CR or LF).
- **Files:**
  - `backend/src/modules/entities/stream/`: audiences, build-change, helpers, send-signal, signal-registry, subscriber-manager, types, versioned-signals.
  - `backend/src/modules/entities/entities-handlers.ts` (stream handler, catchup), `backend/src/schemas/stream-schemas.ts`.
  - `sync-events.ts` is the frontend prioritizer file; the backend equivalents are `modules/entities/entities-listeners.ts` and `stream/send-signal.ts`.
  - `cdc/src/services/api-messages.ts` (audience key, activity id), `cdc/src/pipeline/parse-message.ts` (draft filter).
  - `backend/src/modules/entities/helpers/dispatch-to-stream.ts`: `accessDecisions`, `rowReadDecisions`, `organizationSubscribers`, `productEventReaders`, `dispatchChange`, `dispatchMoveOuts`.
  - `backend/src/modules/entities/entities-listeners.ts`: bus listeners for product events, session end, membership refresh plus user signal, versioned reader signal, generation resync.
  - `backend/src/modules/entities/helpers/session-streams.ts` (`closeAppStream`, `endOrganizationStreams`, `resyncAppStreams`); `backend/src/modules/entities/operations/stream-session-sweep.ts` (60 s sweep).
  - `backend/src/modules/tenants/operations/apply-tenant-status-change.ts` (archive and restore close the streams); `backend/src/modules/auth/sessions/operations/revoke-sessions.ts` (emits `session.revoked`).
  - `sendSignal` callers: `entities-listeners.ts`, `modules/notification/operations/{fan-out,mark-read}.ts`; declarations in `modules/memberships/memberships-module.ts` and `modules/notification/notification-module.ts`.
  - Catchup: `modules/entities/operations/{app-catchup,propagation-hints}.ts`, `backend/src/permissions/view-read-status.ts`.
- **Holds:**
  - `session-endings`: a signed-out, revoked, evicted, replaced, MFA-superseded, impersonation or deleted-account session keeps streaming.
  - `session-sweep`: a session revoked on another instance, expired, deleted outside the API, a removed system role, a gained role, an impersonation whose admin lost the session; a stalled reader stalls the sweep.
  - `outside-writes`: a removed member keeps reading through a cached session after a CDC membership event; the bindings version moves at every membership write.
  - `entities/stream/dispatch-mirror.test.ts`: a removed member still receives, draft rows reach anyone, a several-row event misses its second-row reader.
  - `entities/stream/send-signal.test.ts`: a signal reaching another user, a stream whose membership is gone, another organization or an undeclared type.
  - `entities/stream/move-out.test.ts`: a reparented row stays visible to who lost it. `entities/helpers/dispatch-eligibility.test.ts`: a malformed membership poisons the batch.
  - `tests/catchup-baseline`: numbers for a foreign org or a mismatched path. `tests/catchup-propagation`: a hint names an unreadable row. `tests/sync-generation`: generation read as the API role.
  - `tests/attachment-notifications`: a mention reaches an account without read access. `tests/integration/cdc-event-bus`: two memberships removed in one transaction arrive as one event.
  - `entities/stream/helpers.test.ts`: the heartbeat is a named event and stops with the stream.
- **Asks:** the fan-out table (change kind x subscriber relation -> frame or nothing); where event names and ids come from; what an archived tenant's subscribers still receive; the per-user subscriber cap.
- **Not this class:** object-level reads and range reads belong to B1. The CDC secret and the internal listener belong to the `internal-listener` test and A6. Sign-up pace and account creation belong to the A classes. The `pg_notify` of the Yjs log and the relay belong to B5. Invitation visibility as a property belongs to B3. Frontend handling of frames (`frontend/src/query/realtime/`) is client code.

### B5 Collaborative documents
- **Gain:** cross-tenant read, integrity.
- **Merges:** the upgrade token (short-lived, signed by the backend, verified with the public half in the relay), token audience per document, origin validation at upgrade, awareness payload abuse, `/internal/yjs/materialize` on the internal listener, outside writes, update-log retention, relay outage behaviour, a system admin as the acting user.
- **Advisories:** 2 (ws origin and memory disclosure).
- **Files:**
  - `shared/src/utils/yjs-token.ts`.
  - `backend/src/modules/yjs/`: `yjs-routes.ts`, `yjs-handlers.ts`, `yjs-internal-handlers.ts`, `operations/{get-yjs-token,authorize-yjs-editor,materialize-description,record-outside-write}.ts`, `helpers/sign-yjs-token.ts`, `yjs-module.ts`, `yjs-materializers.ts`.
  - `yjs/src/`: `server/{upgrade,ws-server,auth}.ts`, `data/permissions.ts`, `sync/{relay,materialize,sweep,compaction,session-manager}.ts`, `constants.ts`.
  - `backend/src/lib/listeners.ts` (internal listener, `internalSourceRefusal`).
  - `postMaterialize` in `yjs/src/sync/materialize.ts` is the only caller of the internal route; `authorizeDocument` has one non-test caller in `yjs/src/server/upgrade.ts`; `signYjsToken` has one caller in `get-yjs-token.ts`.
  - Tests: `backend/tests/security/{yjs-token,yjs-materialize,internal-listener}.test.ts`, `backend/tests/{yjs-http,yjs-outside-write}.test.ts`, `yjs/src/tests/*.test.ts` and `yjs/src/tests/integration/*.test.ts`.
- **Holds:**
  - A token for another document, tenant or type: the URL entity type, tenant and entity id must equal the signed claims (403) (`yjs/src/tests/upgrade-handler.test.ts`).
  - A forged or edited token: Ed25519 verify with the public key only, the relay cannot mint (`auth.test.ts`).
  - A revoked member: a new token is refused at the route and the relay refuses a reconnect (`revocation.test.ts`); an open socket closes at `exp`.
  - Scope forgery: storage, session key and the materialize body use the scope read from the row, not the token (`permissions.test.ts`).
  - Frames before authorization never apply; the pre-verification queue is capped.
  - Materialize: a wrong or missing secret, a public address peer, a public listener path, a wrong tenant or organization, no eligible editor, a suspended tenant, a stale merge against an outside write (`yjs-materialize`, `internal-listener`).
  - `yjs-token` and `tests/yjs-http`: token or pull/push for an entity the caller may not update.
- **Asks:** a token reused for another document or after a membership loss; the origin check; what a client writes into awareness that others render (with C4). Message caps belong to C1.
- **Not this class:** frame, document and send-buffer sizes belong to C1. The table name from the token's `entityType` belongs to C3 (here only the `isProduct` gate). Presence colours and names rendering belong to C4. Block media URL sanitizing belongs to C4. Description content as stored XSS belongs to C4.

### B6 MCP face
- **Gain:** cross-tenant read.
- **Merges:** the token-only face, audience per organization endpoint, `tools/list` against scopes (unfiltered by decision), the step-up scope answer, confused deputy, token passthrough, session ids, tool descriptions and entity content returned to a model (the client's problem, stated once), rate limits per actor.
- **Advisories:** none.
- **Files:**
  - `backend/src/modules/mcp/`: `mcp-tools.ts` (redispatches through `app.fetch`; input schema, tool outcome), `mcp-server.ts` (JSON-RPC methods, scope mask), `mcp-handlers.ts`, `mcp-routes.ts` (guards `[tokenGuard, tenantGuard, orgGuard]`, `mcpRequestLimiter`), `mcp-module.ts`.
  - The tool registry is the OpenAPI registry read by `buildMcpTools` in `mcp-tools.ts`; the tool marker is `xTool` in `backend/src/core/openapi-extensions.ts`, checked at route build in `backend/src/core/x-routes.ts`.
  - The `mcp` worker: `backend/src/modules/mcp/worker/mcp-worker-entry.ts` (own `createBaseApp`, mounts only `mcpHandlers`); `mcp/src/mcp-worker.ts` is a short dev entry; in-process under singleVM in `backend/src/main.api.ts`.
  - `backend/src/middlewares/guard/token-guard.ts`, `service-guard.ts` (`setActorFromToken`), `backend/src/modules/oauth-server/{verify-access-token,resources,provider}.ts`.
  - Tools registered today: four `xTool` routes, all attachments, in `backend/src/modules/attachment/attachment-routes.ts`.
  - Tests: `backend/tests/mcp.test.ts`, `backend/tests/mcp-worker.test.ts`, `backend/src/modules/mcp/mcp-server.test.ts`, `mcp-tools.test.ts`, `backend/src/middlewares/guard/token-guard.test.ts`, `backend/tests/security/{api-key-scope,oauth-grants}.test.ts`.
- **Holds:**
  - `token-guard.test.ts`: forged, expired, other-issuer, `alg:none` and HS256-with-public-key tokens never set an actor; a token for another organization's MCP resource is refused.
  - `tests/mcp.test.ts`: a token for another tenant gives 401; a read token calling a write tool gets the scope to step up to (single and batch); a tool call charges the route's own limiters once.
  - `api-key-scope`: a read-only key cannot mint a write token through `client_credentials`.
  - `mcp-server.test.ts`: arguments the route schema refuses never reach the route; a tool outcome never carries SQL or a 5xx message.
  - `oauth-grants`: a member-less user, a revoked grant, a removed membership or a revoked key stops an existing token at the next request.
  - `tests/mcp-worker`: the MCP worker serves the routes and runs in-process.
- **Asks:** the MCP security best practices page as a checklist; which headers and which actor the internal redispatch carries; a tool call with a token minted for another organization's endpoint.
- **Not this class:** token signing, key rollover and revoke caches belong to A5. Object-level reads behind a tool belong to B1. Consent, redirect URI matching, CIMD fetch, PKCE and mix-up `iss` belong to the OAuth server (A5, with `oauth-metadata-fetch-ssrf` and `oauth-connect` tests). Batch size, HLC in tool stx and body size belong to C1. Process-local caches in a split worker belong to C8. Prompt injection through returned content is the MCP client's problem.

## C. What goes in

### C1 Resource exhaustion by input shape
- **Gain:** denial of service.
- **Merges:** unbounded collections (the trigger), a chunked request against `bodyLimit`, JSON depth, compressed JWE, ReDoS (zod 2023, sanitize-html, jspdf, ws), nanoid sizes, and every own cap: pagination `limit`, `include` lists, search terms, Yjs update size, uploads (`max_size`, `max_number_of_files`), SSE subscribers, pg-boss payloads, CDC batches, mail batches.
- **Advisories:** 30 (zod, hono chunked body limit, jose JWE, ws fragments and header count, yaml nesting, node-server aborted handshake, otel baggage).
- **Files:**
  - `backend/src/middlewares/body-limit.ts`, `backend/src/schemas/common-schemas.ts`, `backend/src/middlewares/rate-limiter/` (`core.ts`, `helpers.ts`, `limiters.ts`, `points-cache.ts`, `tests/`), `backend/src/lib/transloadit.ts`.
  - `backend/src/modules/entities/stream/` and its handler `backend/src/modules/entities/entities-handlers.ts`.
  - The relay: `yjs/src/` (`server/ws-server.ts`, `server/upgrade.ts`, `server/rate-limiter.ts`, `constants.ts`) and `backend/src/modules/yjs/`.
  - Config: `shared/config/config.default.ts` (`requestLimits`, `jsonBodyLimit`, `fileUploadLimit`, `defaultBodyLimit`, `uppy`, `localBlobStorage`); `config.template.ts` repeats the three body limits.
  - `ctx.req.json()` call sites: `middlewares/rate-limiter/helpers.ts` (email and bulk-length readers, after `dynamicBodyLimit`), `modules/yjs/yjs-internal-handlers.ts`, `modules/oauth-server/interactions.ts`; `modules/mcp/mcp-routes.ts` takes `jsonBody(z.any())`.
  - `JSON.parse` sites: `backend/src/lib/cdc-websocket.ts` (each worker frame), `modules/yjs/helpers/{description-update,sanitize-block-media}.ts`, `backend/src/utils/extract-keywords.ts` (stored descriptions).
  - pg-boss is cron-only: `backend/src/lib/pg-boss.ts`, `jobs-worker.ts`; no `boss.send` with request data.
- **Holds:**
  - `request-bodies`: an array or record schema in the OpenAPI document without `maxItems` or `maxProperties` (zod collection exhaustion).
  - `backend/src/schemas/common-schemas.test.ts`: `limit` 0, 1001, 2^53 and malformed `offset`.
  - `backend/tests/yjs-http.test.ts`: a Yjs push chunk over 512 KB (400) and a body over 1 MB (413 `body_too_large`), with a full chunk as positive control.
  - `backend/src/modules/yjs/operations/append-yjs-update.test.ts`: an update over `yjsMaxUpdateBytes`. `yjs/src/tests/upgrade-handler.test.ts`: `yjsPendingQueueCap`.
  - `backend/src/middlewares/rate-limiter/tests/` and `brute-force-limits`: the limiters' budgets (policy per route belongs to E1).
- **Asks:** one cap table: input dimension -> cap -> where enforced -> test; a chunked body against the limit; `JSON.parse` depth; a regex inventory where user input meets a `RegExp`; the hono, jose and ws version minimums. Request strings in the OpenAPI document without `maxLength`, `enum`, `format` or `pattern` are listed by running the scout over the document (request side, path params excluded).
- **Not this class:** rate-limit policy per route and budgets belong to E1. SSE fan-out and backpressure correctness belong to B4. SQL cost of `OFFSET` and `ILIKE`/`fold_search` belongs to C3. Outbound fetch size of OAuth client metadata (`oauth-metadata-fetch-limit`) belongs to C5. CDC socket authentication belongs to E3 and B5. XSS in sanitized HTML (sanitize-html, dompurify, jspdf) belongs to C4. The hono CORS ReDoS advisory is unused (no CORS middleware in `backend/src/middlewares/app.ts`) and belongs to C7.

### C2 Object-shape poisoning
- **Gain:** code execution in a browser, integrity.
- **Merges:** `__proto__` and `constructor` keys in bodies, records, query params and i18n interpolation; `Object.assign` with request keys; JSON columns and who writes them (`tenants.restrictions`, `toolsConfig`, settings); Yjs map keys; objects stored in IndexedDB.
- **Advisories:** 6 (dexie, immer, hono `parseBody` dot notation, DOMPurify config pollution).
- **Files:**
  - `boundedRecord` in `backend/src/schemas/common-schemas.ts`.
  - JSON columns (17 files): `tenants.restrictions` in `backend/src/modules/tenants/tenants-db.ts`; `toolsConfig` in `backend/src/db/utils/channel-columns.ts`; organization settings are `organizationFlags` and `setupConfig` in `backend/src/modules/organization/organization-db.ts`.
  - `frontend/src/query/` cache merges. Persisted stores: `ui-store.ts`, `user-store.ts`, `navigation-store.ts`, `board-store.ts`, `offline-files-store.ts`, `docs-search-store.ts` (under `frontend/src/modules/...`) and `frontend/src/query/realtime/sync-store.ts`.
  - `backend/src/db/utils/jsonb-merge.ts`: the one merge helper (SQL `col || jsonb`). `backend/src/core/stx/*` (stx field maps).
  - `shared/src/config-builder/utils.ts` (`mergeDeep`, config build only; skips `__proto__`, `constructor`, `prototype`).
  - `shared/src/utils/derive-description-core.ts`, `backend/src/modules/yjs/helpers/sanitize-block-media.ts` (`JSON.parse` of block JSON).
  - Test: `backend/tests/security/request-bodies.test.ts`.
- **Holds:**
  - `request-bodies`: every array and record in the OpenAPI document has a size bound (a record with a million keys).
  - Zod 4 drops `__proto__` from record and object input.
  - Enum-keyed records: `toolsConfigSchema` keys must be a channel slot (`backend/src/schemas/tools-config.ts`); quota keys must be in `quotaKeys` (`tenants-schema.ts`); flag objects are `z.object` over config keys (`organization-schema.ts`, `user-schema.ts`).
  - jsonb merge is done in SQL from `JSON.stringify` of the parsed value, so a JS object merge never sees stored keys.
  - The persisted sync store saves only `cursor, generation, caughtUpAt, contrast, publicAlertsSeen, hintsSeen`; the keyed maps are never persisted.
  - `Object.fromEntries` in `auth/sso/helpers/transform-sso-claims.ts` uses config-listed keys (`federation.snapshotClaims`).
- **Asks:** a record with `__proto__` through every record-taking route; the JSON column table; the dexie and immer version minimums.
- **Not this class:** block JSON walking and HTML sanitizing belong to C4. The metadata document fetch by `oidc-provider` (`modules/oauth-server/provider.ts`) belongs to C5 and C7. Rate limit on that fetch belongs to C1. `sql.raw` keys (counter keys in `modules/entities/counters-queries.ts`) belong to C3. Record size caps belong to C1. Yjs map keys: no app code reads user map keys; document size belongs to C1.

### C3 SQL assembly and identifiers
- **Gain:** code execution on the server, so cross-tenant read.
- **Merges:** every `sql.raw` argument: `member-counts.ts` (`'${type}'`, `scopeColumn`), `entities-queries.ts` (jsonb paths from entity types), `counters-queries.ts`, `yjs-queries.ts` (table and column names), `rls-helpers.ts` (setting names), `path-column.ts`; sort keys and `ORDER BY` from a request; `ILIKE` escaping of `%`, `_` and `\`; `current_setting` values; migrations written as strings.
- **Advisories:** 13 (drizzle identifier escaping, pg 2018 in eleven rows).
- **Files:**
  - `backend/src/modules/memberships/helpers/member-counts.ts`, `backend/src/modules/entities/entities-queries.ts`, `backend/src/modules/entities/counters-queries.ts`, `backend/src/modules/yjs/yjs-queries.ts`, `backend/src/db/rls-helpers.ts`, `backend/src/db/utils/path-column.ts`.
  - Added by grep: `backend/src/modules/entities/counter-keys.ts` (`likeAny` builds `col LIKE 'prefix%'` from constant prefixes), `backend/src/db/utils/jsonb-counters.ts` (`jsonbIntRaw`, inlines a jsonb key with `'` doubled), `backend/src/utils/sql.ts` (`textSearchFilter`, the only LIKE helper), `backend/src/utils/order-column.ts` (`getOrderColumns`), `backend/src/db/tenant-transaction-opening.ts` (the `BEGIN; SELECT set_config(...)` text for the API and the relay, `yjs/src/data/db.ts`).
  - `shared/src/config-builder/entity-hierarchy.ts` (`pathColumnSql`, `deepestAncestorSql`, the text `sql.raw` receives); `shared/src/utils/schema-naming.ts` (`toColumnName`, `toTableName`).
  - Other raw sites: `yjs/src/data/permissions.ts`, `cdc/src/pipeline/{process-flush,verify}.ts`, `cdc/src/utils/apply-unified-deltas.ts`, `backend/src/lib/jobs-health.ts`, `backend/scripts/jobs.ts`, `bench/src/seed-utils.ts`.
  - `cdc/dist/cdc-worker.js` is a build artifact, not a site.
- **Holds:**
  - Types come from hierarchy enums; `backend/src/modules/schema-contracts.test.ts` is the test the plan names.
  - `backend/src/utils/order-column.test.ts`: the sort lookup and fallback. `backend/src/db/utils/path-column.test.ts`: the SQL path expression equals the TS path.
  - In code: the idAlphabet check (`tenant-transaction-opening.ts`); the `isProduct` gate before dynamic table names (`yjs-queries.ts`, `yjs/src/data/permissions.ts`); signed-token binding of `entityType` (`yjs/src/server/upgrade.ts`); `escapeLikePattern` (`utils/sql.ts`); `jsonbIntRaw` quote doubling.
- **Asks:** a table of every raw argument's origin (config enum, hierarchy column, request); the escape helper and its callers; a search term with `%`.
- **Not this class:** RLS policy semantics around `current_setting` belong to B1. `q` and `limit` size caps and `boundedRecord` belong to C1. `lastPostedAtOrder` (memberships `sort=lastPostedAt`) is a sort expression in a column map and enters this table if it holds raw text. Whether a refused tenant id answers 400 or 500 is error handling (E3).

### C4 Output encoding: HTML, PDF, email, CSS
- **Gain:** code execution in a browser on the app origin.
- **Merges:** the DOMPurify call in `blocknote/full-html.tsx` and its options against the 37 advisories (IN_PLACE, SAFE_FOR_TEMPLATES, custom elements, config pollution, mXSS, open redirect); `sanitize-html` in the backend and its call sites; `escapeValue: false` on both i18n instances; jspdf inputs (table export) and its PDF JavaScript injections; pdf.js executing JavaScript on open in the attachment preview (`attachment/render/pdf.tsx`); `docs/code-viewer.tsx`, `ui/chart.tsx` and `themer.ts` (`--brand: ${color}`) as sinks; email rendering (`neutralizeBrevoTags`, `sanitizeEmailSubject`); SVG and HTML uploads served from the public bucket; Yjs awareness names; `Content-Disposition` on downloads; the Content-Security-Policy of the app origin.
- **Advisories:** 83 (DOMPurify 37, sanitize-html 17, jspdf 15, react and react-dom 8, i18next 2, react-pdf 2, maplibre 1, i18next-http-backend 1).
- **Files:**
  - `frontend/src/modules/common/blocknote/full-html.tsx`: the DOMPurify import, URI regexp and call.
  - `sanitize-html` is a backend dependency with call sites in `backend/emails/components/safe-html.tsx` (`sanitizeEmailHtml`, `SafeHtml`) and `backend/src/lib/mailer.ts` (HTML params).
  - `escapeValue: false`: `frontend/src/lib/i18n.ts` and `backend/src/lib/i18n.ts`; emails use `backend/emails/i18n.ts` with `escapeValue: true` and a `plainText` opt-out.
  - jspdf: `frontend/src/lib/export.ts`, caller `frontend/src/modules/common/data-table/view-menu.tsx`.
  - pdf.js: `frontend/src/modules/attachment/render/pdf.tsx` (worker bundled from react-pdf's pdfjs copy, see `frontend/vite.config.ts`; `file` comes from `attachment-render.tsx`).
  - `frontend/src/modules/docs/code-viewer.tsx` (shiki `codeToHtml`, used by `docs/viewer-group.tsx`); `frontend/src/modules/ui/chart.tsx` (`<style dangerouslySetInnerHTML>`, used only by stories); `frontend/src/modules/common/themer.ts` (`color` from `appConfig.theme.colors`).
  - Email: `neutralizeBrevoTags` in `backend/src/lib/mailer.ts`; `backend/src/utils/sanitize-email-subject.ts`; templates use `plainText` for subject, preview and greeting (`backend/emails/templates/*.tsx`); `backend/emails/renderer/escape-string.ts`. Other raw sinks: `backend/emails/components/primitives/raw.tsx`, `button.tsx`, `container.tsx`, `backend/emails/renderer/jsx-to-string.ts`.
  - Upload templates: `shared/config/transloadit-config.ts` (public avatar, cover and newsletter; private attachment, whose `use` list exports `':original'`); `backend/src/lib/transloadit.ts` only signs params. Uppy types: `shared/config/config.default.ts`, `frontend/src/modules/attachment/table/use-attachments-upload-dialog.ts`.
  - CDN origins: `shared/src/config-builder/app-config.ts`, `shared/src/utils/is-cdn-url.ts`.
  - Downloads: no `Content-Disposition` in `backend/src`, `frontend/src`, `shared/src` or `infra`; downloads are a client `<a download>` of a blob (`frontend/src/lib/export.ts`) or a presigned or CDN URL (`attachment-render.tsx`, `attachments-carousel.tsx`).
  - Awareness: `frontend/src/modules/common/blocknote/collaborative-blocknote.tsx` (sets `user: { name, color }`); peers render with BlockNote `YCursorPlugin`; the relay (`yjs/src/sync/relay.ts`, `yjs/src/constants.ts`) checks awareness client-id ownership, rate and entry counts.
  - Response headers: the app origin is served by Caddy with a CSP (`infra/caddy/Caddyfile`, built in `infra/config/frontend-csp.config.ts`, bound in `infra/config/env-suppliers.config.ts`, asserted by `infra/tasks/smoke.ts` and `infra/tests/unit/caddyfile.test.ts`), plus HSTS, `X-Frame-Options DENY`, `nosniff`, referrer, permissions and COOP. The API sets Hono `secureHeaders` (`backend/src/middlewares/app.ts`, `shared/src/health-app.ts`) with no CSP of its own; the bucket and CDN set none in `infra/`.
  - CSP shape: `script-src 'self' *.gleap.io` (no `unsafe-inline`, no `unsafe-eval`), `style-src 'self' 'unsafe-inline'`, `img-src 'self' blob: https: data:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src` lists the API, Yjs, S3, maps, Transloadit, gleap, maple and onedollarstats.
- **Holds:**
  - `tests/emails/email-escaping`: a sender, org, actor or context name cannot inject a link into invite, mention and digest mail; button text cannot inject markup into the Outlook fallback; subject and preview stay unescaped while the rendered mail escapes once.
  - `tests/emails/brevo-send`: a name cannot open a Brevo template tag, no `|safe` on an undeclared key, typed placeholder text is not filled, digest user text is neither markup nor Brevo syntax.
  - `block-media-refs`: a document cannot load media from outside the organization (client writes, malformed media block, welcome text, relay writes).
  - `profile-image-urls`: an avatar or banner cannot point at another host through a CDN-prefixed URL.
  - `upload-visibility`: an attachment cannot be stored public by choosing the public bucket, no system upload token without the system role, public templates store re-encoded images.
  - `infra/tests/unit/caddyfile.test.ts`: Caddy binds the CSP header; `infra/tasks/smoke.ts` fails a deploy without it.
- **Asks:** sink -> sanitizer options -> version minimum as a table; pdf.js `isEvalSupported` and the worker origin; what user text reaches jspdf; the SVG upload policy; `--brand` validation; the CSP's remaining reach (CSS injection, `img-src https:` beacons, markup injection, the `*.gleap.io` script host).
- **Not this class:** jsPDF and sanitize-html ReDoS belong to C1. DOMPurify prototype pollution belongs to C2. The i18next-http-backend path traversal and URL injection belong to C5. The jsPDF local file read (Node `fs`) belongs to C5 and C6. Presigned URL shape and storage keys belong to C6. Hono headers and `secureHeaders` defaults belong to C7 and A2.

### C5 Server-side requests and outbound trust
- **Gain:** secret exposure (cloud metadata), reads of internal services.
- **Merges:** the seven server-side `fetch` sites (client metadata for CIMD, the provider round trip, Brevo, Matrix, geoip, the health probe, the relay's materialize call), federation metadata, Transloadit and Companion fetching a user's URL for `@uppy/url`, the planned link cards (in-app fetch of user URLs) and webhooks (outbound to user URLs), the metadata address (infra M3), DNS rebinding, redirects followed, size and time caps, TLS verification.
- **Advisories:** 1 (i18next-http-backend).
- **Files:**
  - `frontend/src/modules/common/uploader/helpers/uppy-helpers.ts`: `@uppy/url` with `COMPANION_URL` and `COMPANION_ALLOWED_HOSTS` from `@uppy/transloadit`; used by `open-image-upload.ts` and `blocknote/custom-file-panel/uppy-upload-panel.tsx`.
  - `backend/src/lib/health-probe.ts` (caller `backend/src/lib/health.ts`), `backend/src/lib/geoip.ts`, `backend/src/lib/mailer.ts` (Brevo), `backend/src/modules/requests/helpers/send-matrix-message.ts`, `yjs/src/sync/materialize.ts` (the relay's materialize call), CIMD and provider fetches in `backend/src/modules/oauth-server/`.
  - No outbound wrapper exists in `backend/src/lib`. `backend/src/utils/ip-subnet.ts` is client-address subnetting, not an outbound check.
  - `oauth/` and `mcp/` packages hold only `oauth/src/oauth-worker.ts` and `mcp/src/mcp-worker.ts` with no fetch calls; the worker code is `backend/src/modules/oauth-server/worker/oauth-worker-entry.ts` and `backend/src/modules/mcp/worker/mcp-worker-entry.ts` (`waitForBackend` in `shared/src/utils/wait-for-backend.ts`). `mcp-tools.ts` uses an in-process `app.fetch`, not a network call.
  - `cdc/` has only a WebSocket client (`cdc/src/network/websocket-client.ts`). `backend/src/lib/transloadit.ts` only signs params. S3: `backend/src/lib/object-storage.ts` builds a client for `https://${appConfig.s3.host}`.
  - `backend/src/modules/push/helpers/push-service-endpoint.ts` and `push-sender.ts` (endpoint allowlist).
- **Holds:**
  - `oauth-metadata-fetch-limit`: a flood of first-time client ids from one address fetches no more documents than the budget (`clientMetadataFetchLimiter`); the same flood through the consent page shares the budget; a cached document naming a `sector_identifier_uri` makes no sector fetch; known clients refresh without spending the budget; discovery and JWKS stay outside the budget.
  - `backend/src/modules/push/push-sender.test.ts`: the metadata address and a `;`-suffixed lookalike host are refused as push endpoints (host allowlist, legacy `url.parse` differential).
  - In the lib, CIMD fetches use `redirect: 'manual'`, a 5 KiB cap, a 2.5 s timeout and a special-use socket check.
- **Asks:** one outbound policy, decided once before link cards and webhooks ship: destination rule (private ranges and the metadata address refused), redirect limit, size and time caps, no credentials forwarded; today's sites against it as a table.
- **Not this class:** provider claims, `redirect_uri` handling and `state`/open redirect belong to A4. Mail content and templating belong to D3. Cloud metadata address blocking at the network layer belongs to F3 (M3 is noted here). SVG and HTML uploads, signed URL scope and `logo_uri` rendering belong to C4 and C6. Companion's own fetching of user URLs happens at Transloadit; CSP `connect-src` for it is in `infra/config/frontend-csp.config.ts`.

### C6 Files and storage
- **Gain:** cross-tenant read, code execution in a browser.
- **Merges:** storage keys (traversal, one key space per tenant), presigned URL lifetime and scope per variant, public against private bucket, a content type trusted from the client, filenames in headers, size caps, image conversion, replaced-image release, the deleted-storage sweep, upload token minting, uploads by service accounts (open), the offline file cache in the browser, bucket policies and hashed asset paths (infra G1).
- **Advisories:** none.
- **Files:**
  - `backend/src/modules/attachment/helpers/` (`signed-url.ts`, `storage-key.ts`, `stored-file.ts`, `signed-url.test.ts`).
  - `backend/src/modules/attachment/operations/`: `get-presigned-urls.ts`, `create-attachments.ts`, `link-attachment-keys.ts`, `release-replaced-images.ts`, `delete-attachments.ts`.
  - `backend/src/lib/object-storage.ts` (S3 client, `storedObjectSize`, `deleteStoredObjects`, `deleteStoredPrefix`), `backend/src/lib/transloadit.ts` (+ `transloadit.test.ts`), `backend/src/db/storage-columns.ts`.
  - The `me` upload token: `backend/src/modules/me/operations/get-upload-token.ts` (route in `me-routes.ts`, handler in `me-handlers.ts`).
  - Templates: `shared/config/transloadit-config.ts`; visibility: `shared/src/utils/upload-visibility.ts`.
  - Sweep: `backend/src/modules/entities/operations/clear-deleted-storage.ts`, queue `modules/entities/deleted-storage-db.ts`.
  - Tests: `backend/tests/deleted-storage.test.ts`, `backend/tests/replaced-images.test.ts`.
  - Frontend: `frontend/src/modules/attachment/{file-url.ts,helpers/parse-uploaded.ts,offline/{download-service,upload-service,storage-service,attachments-db}.ts}`, `common/uploader/helpers/{uppy-helpers,fresh-assembly-options}.ts`, `frontend/src/query/local-user-db.ts`.
  - Callers: `releaseReplacedImages` from `update-me.ts`, `update-user.ts`, `update-organization.ts`; `signedUploadParams` only from `get-upload-token.ts`; `getSignedUrlFromKey` only from `get-presigned-urls.ts`; `deleteStoredObjects` from `release-replaced-images.ts` and `clear-deleted-storage.ts`; `deleteStoredPrefix` only from `clear-deleted-storage.ts`; `storedObjectSize` via `stored-file.ts`.
- **Holds:**
  - `storage-keys`: planting another tenant's or member's key on an own attachment row, `..` and dot segments, a `blob:` key signed or hidden behind a prefix, a client naming a bucket or claiming public, a planted key presigned, an upload token into another organization, linking keys by a non-uploader, twice, or to a deleted row. Enforced in `namesUploaderStorage` and `isSignableKey` (`storage-key.ts`) and `isOrganizationKey` (`media-ref.ts`).
  - `signed-url.test.ts` and `operations/get-presigned-urls.test.ts`: presign of another tenant's, denied or missing id with one `rejectedIds` answer (no existence oracle).
  - `upload-visibility`: public file via the public bucket for an attachment, a non-admin newsletter token; `transloadit.test.ts`: a public template exports only re-encoded images.
  - `attachment-idempotency`: a replay returning another member's rows. `profile-image-urls`: an avatar or banner at a foreign host.
  - `deleted-storage` and `replaced-images`: a sweep or release deleting a key a live row, a seed or another holder names.
  - A missing storage key in the bucket is refused (`storedFileSize` HEADs every variant, 400 `missing_object`). Signed upload params expire in 15 minutes with a nonce per token; the token route is limited per user (`limiters.ts`).
- **Asks:** a presigned URL for another tenant's key; a key with `..`; a file declared `text/html` on the public bucket; what the bucket origin shares with the app origin (with C4).
- **Not this class:** content-type rendering, CSP, SVG in the editor and the `img-src https:` beacon belong to C4. Tombstone range reads leaking `keys` and filenames to later members belong to B1. A product cache serving a deleted attachment belongs to C8. Storage keys and S3 secrets in logs, and `S3_ACCESS_KEY_*` at rest, belong to D1. Bucket policies, `minimumReleaseAge`, the frontend bucket's hashed paths and the builder key belong to the infra review (G1). Rate limiter bypass of the upload-token limiter belongs to A6 and B4. Transloadit's own fetching through `/document/convert` belongs to C5.

### C7 Request parsing, routing and cross-site differentials
- **Gain:** guard bypass, reaching internal routes.
- **Merges:** `app.mount` in `server.ts` with encoded paths (`lib/listeners.ts` already notes `/api/%2e%2e/internal/cdc`), repeated and encoded slashes, header de-duplication, a cross-site form post per Content-Type, the absence of CORS as the design, the load balancer's prefix handling, the Host header, `Referrer-Policy` on invoke-token paths, `isbot` as a bypass.
- **Advisories:** 8, plus 1 pattern lesson (hono mount prefix with encoded paths, query after the fragment, CSRF middleware bypass by Content-Type x2, Vary injection, path confusion; node-server encoded slashes, repeated slashes, double dots).
- **Files:**
  - `backend/src/server.ts`: `mountPrefix` for `/api` and `/mcp`, custom `replaceRequest`. The oauth process mounts itself in `backend/src/modules/oauth-server/server.ts` with `startsWith` on the raw `req.url`; the load balancer prefix `/oauth` precedes it (`infra/config/services.config.ts`).
  - `backend/src/lib/listeners.ts`: `serveApi`, `internalApp` (source refusal, then body limit), `isCdcUpgradePath` (raw-target match), `serveInternal` upgrade handler. Internal routes: `/internal/yjs`, `/internal/cdc` (WebSocket upgrade only), the shared health path.
  - `backend/src/middlewares/app.ts`: chain order is request-log context, invoke-token `Referrer-Policy`, `secureHeaders`, otel, request id, logger, CSRF (with skips), client version, body limit, compress (GET only).
  - `backend/src/middlewares/is-no-bot.ts` (used on `metrics-routes.ts`, `magic-routes.ts` and the auth routes in `general-routes.ts`).
  - `backend/src/middlewares/guard/service-guard.ts` (an API-key request carrying `Origin` is refused 403 `browser_origin`); `backend/src/modules/service-accounts/helpers/api-key.ts` (`hasApiKeyHeader`).
  - Infra: `infra/resources/loadbalancer.ts` (path routes with `matchPathBegin`, host routes, internal frontends and ACLs, apex redirect), `infra/caddy/Caddyfile` (frontend only). Prefixes `/api`, `/yjs`, `/mcp`, `/oauth` in `infra/config/services.config.ts`; mcp and oauth reuse the backend image under `MODE`, and `backend/src/routes.ts` mounts every registered module in every mode.
  - Tests: `backend/tests/prefix-mount.test.ts` and `backend/tests/request-id.test.ts` at `backend/tests/`; `csrf`, `malformed-ids`, `internal-listener` under `backend/tests/security/`.
- **Holds:**
  - `internal-listener`: the CDC socket is not reachable from the public listener under `/internal/cdc`, `/api/%2e%2e/internal/cdc`, `/api/../internal/cdc` or `/api/internal/cdc`; `/internal/yjs/materialize` is a 404 on the public listener under plain, `/api` and `/api/%2e%2e` prefixes even with the relay secret; `isCdcUpgradePath` matches only the exact raw target; dot-segment paths to the CDC socket on the internal listener are 404; an empty or missing secret is refused; a non-private peer is refused on every internal route; the health path stays served.
  - `csrf`: a form post (`application/x-www-form-urlencoded`) with a session cookie from a foreign origin, or with no Origin, is a 403 before the handler; from the app's own origin it works.
  - `malformed-ids`: malformed and NUL ids in path segments answer 400 or 404 without a 500 or a query echo.
  - `prefix-mount`: over a real socket `''`, `/api`, `/mcp` serve the same route with path, query, headers and bodies intact; an unknown path under a prefix is a 404 `route_not_found`.
  - `request-id`: a caller cannot choose the request id.
  - There is no CORS middleware; a cross-origin `fetch` with a JSON body needs a preflight that no route answers with a grant. `secureHeaders` is on every response.
- **Asks:** a request-shape table (encoding, slashes, fragment, duplicate headers, methods) against load balancer, Node and Hono together, on staging; a cross-site post with each Content-Type; the node-server version minimum.
- **Not this class:** body sizes, HLC stamps and MCP batches belong to C1. Address trust, `X-Forwarded-For` and the internal listener's peer policy belong to A6. GET state change through `invoke-token` and OAuth callbacks belong to A1 (token spend) and A4. Output encoding and `Content-Type` of responses (`nosniff`) belong to C4. `isbot` is a mail-scanner prefetch guard (400 `maybe_bot` for a bot User-Agent on `invokeToken`, `getTokenData`, `acceptInvitationToken` and similar), not an access control; spend semantics belong to A1. The separate mcp and oauth processes' own headers and body limits belong to their module classes (B6, A5).

### C8 Caches and cross-request state
- **Gain:** cross-user read.
- **Merges:** the product cache (re-authorizes per request: holds), the membership, organization, tenant, session, API key and token-grant caches with their invalidation across processes, module-level state that outlives a request, `ttl-cache.ts`, `points-cache.ts`, the per-user database in the browser (holds), service-worker caches of API responses.
- **Advisories:** 1, plus 1 pattern lesson (hono cache middleware; pattern: per-request context not isolated).
- **Files:**
  - `backend/src/middlewares/guard/*-cache.ts` (api-key, membership, org, session, tenant, token-grant) and `invalidate-cache.ts`.
  - `backend/src/middlewares/product-cache/` (`product-cache.ts`, `product-cache-store.ts`, `index.ts`).
  - `backend/src/lib/ttl-cache.ts`: every cache wraps it (`@isaacs/ttlcache`; `load()` coalesces reads per cache and drops results of reads older than the last invalidation). `backend/src/utils/request-coalescing.ts` (in-flight map, keys scoped by the caller).
  - `backend/src/middlewares/rate-limiter/points-cache.ts`; `frontend/src/lib/sw.ts` (Serwist).
  - The `mcp` and `oauth` workers hold no cache of their own; their code is `backend/src/modules/mcp/*` and `backend/src/modules/oauth-server/*`.
  - Tests: `backend/tests/security/{outside-writes,session-cache-race}.test.ts`, `backend/src/middlewares/guard/api-key-cache.test.ts`, `backend/src/middlewares/product-cache/{product-cache,product-cache-store}.test.ts`, `backend/src/lib/ttl-cache.test.ts`, `backend/src/middlewares/rate-limiter/tests/points-cache.test.ts`.
- **Holds:**
  - `session-cache-race`: a session read in flight at a revoke stores nothing; a burst shares one read.
  - `outside-writes`: a membership removal reported by CDC drops the cached session; a revoke by another process is seen after the 10 s TTL; every membership insert, update, delete and cascade moves `actors.bindings_version` (trigger in `backend/src/db/membership-rules.ts`), which is why `membership-cache.ts` needs no drop.
  - A tenant archive or suspend moves the members' bindings version (`modules/tenants/operations/apply-tenant-status-change.ts`).
  - Product cache: re-authorizes every hit against the cached row, requires tenant and organization of the URL, draft veto (`product-cache.test.ts`); a read in flight at an invalidation or write stores nothing (`product-cache-store.test.ts`).
  - `api-key-cache.test.ts`: account-wide drop, in-flight read at the drop not stored, unknown key not cached.
  - `ttl-cache.test.ts`: no value read before an invalidation is stored or handed out; two caches' flights stay apart.
  - Session expiry is rechecked outside the cache (`resolve-session.ts`); the token grant is read per use (`service-guard.ts`).
  - `points-cache.test.ts`: window and debt.
- **Asks:** a cache inventory: key, what the answer depends on, invalidation source, TTL, test; a grep for module-level mutable state in request paths.
- **Not this class:** who may read an entity belongs to B1. Token lifetimes and the key cache TTL belong to A5. Session lifecycle, impersonation and revoke belong to A2. Yjs relay socket authorization held for a socket's life (`yjs/src/sync/session-manager.ts`) belongs to B5. SSE subscriber state (`entities/stream/subscriber-manager.ts`) belongs to B4 and A2. HLC state belongs to C1 and E2.

## D. What comes out

### D1 Secrets and sensitive data
- **Gain:** secret exposure.
- **Merges:** the secret-column registry, `DATA_ENCRYPTION_KEY` (TOTP secrets, the private JWK), the PII hash secret, the cookie MAC key, env-mode secrets, log redaction (`redact-keys.ts`), OTel attributes, error messages, request details in mails, the CDC row image, activities, the browser (the per-user database deleted on a hard sign-out; what a soft sign-out leaves; the service worker), `.env` in dev, seeds.
- **Advisories:** 1 (otel `db.user` span attribute).
- **Files:**
  - `backend/src/db/secret-columns.ts` (registry, pattern, `secretColumnsOf`).
  - `backend/src/lib/redact-keys.ts`; `backend/src/lib/pino.ts` (adds `req.headers.authorization` and `req.headers.cookie`); `cdc/src/lib/pino.ts` and `yjs/src/lib/pino.ts` reuse `redactPaths`.
  - `shared/src/tracing/redacting-span-processor.ts` (scrubs every span), `shared/src/utils/scrub-url.ts` (key list), `shared/src/otel.ts` (http, undici, pg instrumentations).
  - `backend/src/lib/error.ts` (`exposesServerMessages`, `hideIfServerError`, `appErrorHandler`).
  - `backend/src/utils/data-encryption.ts` (AES-256-GCM, HKDF per purpose); users: `modules/auth/totps/helpers/totp-secret-encryption.ts`, `modules/oauth-server/keystore.ts`.
  - `backend/src/utils/hash-pii.ts`, `hash-token.ts`.
  - `backend/src/env.ts`, `backend/src/env-mode-secrets.ts`, `infra/config/runtime-secrets.config.ts`.
  - CDC strip: `cdc/src/utils/compact-row-data.ts`; activity: `cdc/src/services/create-activity.ts`, `cdc/src/utils/get-changed-fields.ts` (names only).
  - Browser: `frontend/src/utils/teardown-user-state.ts`, `frontend/src/query/local-user-db.ts`, `frontend/src/query/local-user-storage.ts`, `frontend/src/query/idb-kv-storage.ts`, `frontend/src/lib/sw.ts`, `frontend/src/modules/auth/end-session.ts`, `frontend/src/query/on-error.ts`.
  - `.env.example` lists every secret name; no seed script reads a secret.
- **Holds:**
  - `response-secrets`: seeds real secrets, requests routes, fails when a stored secret value or a secret-named key appears in any body at any depth.
  - `trace-redaction`: a magic, invitation, unsubscribe or OAuth-callback token in a URL must not reach an exported span or the request log line.
  - `failed-query-redaction`: a request value in a failed query must not reach a log, a span or a colliding database `detail`.
  - `server-error-messages`: a failed query must not show in a 5xx outside development (development is the control).
  - `backend/src/env.test.ts`: a worker mode boots without secrets of other modes; the API refuses to boot without the Yjs key; short or empty cookie and unsubscribe secrets refuse to boot; a rotated cookie list boots.
  - `tests/emails/security-inbox`, `request-details`. `cdc/src/tests/secret-columns.test.ts`: a column matching the pattern outside both maps fails.
- **Asks:** a secrets inventory (name, where it lives, who reads it, rotation path) and the at-rest story per store (Postgres, bucket, browser, logs, traces); the otel version minimum.
- **Not this class:** which fields a response shows by relation belongs to B3. User and email enumeration belongs to D2. Mail content and escaping belong to D3. Presigned-URL authorization belongs to B1 and C6. Fetch sinks that leak a secret through a URL belong to C5. Rate-limit pseudonym key space belongs to D2.

### D2 Enumeration and side channels
- **Gain:** reconnaissance for A1 and E1.
- **Merges:** account enumeration, the Refusals table of PERMISSIONS.md as the policy, timing-safe comparison of tokens and hashes, invited addresses, `getUsers` search by address, a 429 as an oracle, error `type` differences, response sizes.
- **Advisories:** 1 (hono timing comparison).
- **Files:**
  - `cella/PERMISSIONS.md` (the Refusals table).
  - `backend/src/modules/user/operations/get-users.ts`, `get-user.ts` (`getUsersOp`, `getUserOp`).
  - `backend/src/middlewares/rate-limiter/limiters.ts`.
  - `shared/src/utils/safe-equal.ts`: the code's own comparison helper (the hono `timingSafeEqual` is not imported).
  - Call sites: `isRecognizedBrowser` in `check-email` (`auth/general/general-handlers.ts`), `magicLinkLimiter.exempt`, `send-magic-link.ts`; `maySignUp` in `send-magic-link.ts` and `handle-oauth-callback.ts`; `findUserByEmail` in anonymous paths (`send-magic-link.ts`, `modules/requests/operations/create-request.ts`, `handle-oauth-callback.ts`, `provision-sso-user.ts`).
  - Tests: `backend/tests/security/{account-enumeration,product-existence,relatable-organizations,pending-invitations}.test.ts`.
- **Holds:**
  - `account-enumeration`: an email in the passkey challenge body changing the answer; a passkey no account holds naming an email (same 404 for account and stranger); `recognized` true for an address the prober's browser never signed in to; a waitlist form answering account, stranger and repeat differently. The owner's browser still learns `recognized: true` (positive control).
  - `product-existence`: getAttachment and updateAttachment confirming an unreadable id (404 for missing and unreadable; 403 only for a readable row).
  - `relatable-organizations`: organizations of another user across tenants, a malformed `relatableUserId` reaching the database, role and archive filters on another user's list.
  - `pending-invitations`: the pending list, resend, invite response and invite check telling an account from a new address.
  - `tenant-access`: missing, inactive and foreign tenants told apart; `checkSlug` 204/409.
  - `brute-force-limits`: mailing one address forever, the magic budget telling account from none, check-email lookups without end.
  - `resend-invitation`: resend by address against an unknown id answer alike. `cross-org`: `getUser`/`getUsers` outside a shared organization.
  - `unsubscribe-tokens`: the token is verified before the user lookup (401 first, 404 only after a valid HMAC).
- **Asks:** every "does X exist" answer in the API as a table against the Refusals table; every comparison of a secret.
- **Not this class:** invitation token takeover and invoke-token under a cross-site GET belong to C7. Cookie MAC forgery, session revocation and the device cap belong to A2 and A1. `sso_email_unproven` and SSO address trust belong to A4. Brute-force budgets of TOTP and step-up codes belong to A3. Mail content, who can mail whom and Brevo params belong to D3. Secrets at rest and in logs belong to D1. Relay tokens belong to B5.

### D3 Mail, push and notification channels
- **Gain:** abuse, phishing from the app's sender.
- **Merges:** header and subject injection, template params, who can make the app mail whom (invitation floods), digest content across organizations, one-click unsubscribe without CSRF, push endpoint ownership and its URL, Matrix content, security mails on factor changes, mail scanners opening links.
- **Advisories:** none.
- **Files:**
  - `backend/src/lib/mailer.ts`: the only Brevo caller (fixed `https://api.brevo.com/v3/smtp/email`).
  - `backend/emails/templates/*.tsx` (16 templates), `backend/emails/{frame,types,i18n,shared-texts}.ts`, `backend/emails/renderer/*`, `backend/emails/components/safe-html`. `welcome.tsx` has no sender.
  - `backend/src/utils/sanitize-email-subject.ts` (control characters to a space, 150 characters).
  - Notification mails: `backend/src/modules/notification/emails/{mention,comment,digest}-email.tsx`, `operations/{run-digest,build-digest,send-instant-emails,fan-out,unsubscribe}.ts`, `helpers/{category-token,render-digest-html}.ts`.
  - `backend/src/modules/push/{push-sender,push-queries,push-schema,push-routes,push-handlers}.ts`, `helpers/push-service-endpoint.ts`.
  - `backend/src/modules/requests/helpers/send-matrix-message.ts` (caller `requests/operations/create-request.ts`).
  - `mailer.sendEmails` callers: `send-invitation-mails.ts`, `send-magic-link.ts`, `send-step-up-code.ts`, `send-oauth-verification-email.ts`, `send-account-security-email.ts`, `confirm-invitation-address.ts`, `create-request.ts`, `remove-archived-tenants.ts`, `send-newsletter.ts`, `run-digest.ts`, `send-instant-emails.ts`.
  - `sendInvitationMails` callers: `create-memberships.ts`, `deferred-invites.ts`, `resend-pending-invitation.ts`, `resend-invitation.ts`, `create-invite.ts`. `sendAccountSecurityEmail` callers: `handle-oauth-callback.ts`, `totp-budget.ts`, `totps-handlers.ts`, `passkeys-handlers.ts`, `connect-sso-identity.ts`, `notify-sign-in.ts`, `toggle-mfa.ts`. `sendSecurityInboxEmail` callers: `sys-admin-guard.ts`, `impersonation.ts`, `notify-sign-in.ts`, `create-tenant.ts`, `system-listeners.ts`.
  - CSRF skip: `backend/src/middlewares/app.ts`. Limiters: `backend/src/middlewares/rate-limiter/limiters.ts` (`spamLimiter`), `core.ts`.
- **Holds:**
  - Brevo tag injection: `neutralizeBrevoTags` breaks every opener except the mailer's nonce-keyed placeholders (`tests/emails/brevo-send`).
  - Subject header injection: newline and control characters removed, then tags neutralized (`email-escaping`: subject unescaped, rendered mail escaped once).
  - Declared HTML params go out sanitized; digest section HTML escapes channel names (`brevo-send`, `email-escaping`). HTML in names: invite, mention and digest templates escape names (`email-escaping`, `email-templates`); names refuse `<>` and control characters (`common-schemas.ts`).
  - Sender and reply-to are fixed to `appConfig.senderEmail` and the inviter's own address. `X-Request-Id` is server-generated (`request-id`). The inviter's whereabouts never reach the invitee (`tests/emails/request-details`).
  - Unsubscribe: HMAC over `userId:category`, constant-time, verified before any read; GET only redirects; POST needs the token; a per-address failed-proof limiter (`unsubscribe-tokens`). One-click header per recipient, one recipient per request (`brevo-send`).
  - Digest and instant mail: rows need a current membership of the row's organization or a system admin role, then per row `findReadableSubjectIds` (`notification-access`). The digest query is per `userId`, so one digest spans every organization the user is still in, never others.
  - Push: endpoint allowlist at store and at send, payload is ids only, delete is scoped to the caller (`push-endpoints`, `push-sender.test.ts`).
  - Account-exists mail: one per address per day. Waitlist and newsletter repeats dropped by a unique index. Sign-in notices: three per user per 24 hours, none for inbox sign-ins. Magic link per address cap 3 per 30 minutes (`brute-force-limits`).
- **Asks:** the Brevo params and headers as a table; a member mailing a non-member; push endpoint host validation.
- **Not this class:** invitation address handover into `emails` belongs to C7. Rate limiter mechanics and buckets in the database belong to C1 and C8. Token entropy, token storage and magic-link and step-up code guessing belong to A1 and A5. Logging of addresses, push endpoints and mail addresses belongs to D1. Outbound request hosts (Brevo, Matrix, push) belong to C5. Who may create a tenant or organization (the sender of invitation floods) belongs to the E classes and B1.

## E. Abuse and failure

### E1 Rate limits and business-flow abuse
- **Gain:** abuse, cost, brute force.
- **Merges:** the 38 routes without a limiter, tiers and daily ceilings, keyed pseudonyms, the store failure mode (an attempt the store cannot count goes through: by design, to decide), tenant quotas, sign-up and invitation floods, SSE connects, upload tokens, MCP calls, the points budget per tenant against per actor, code space against budget for OTP and step-up codes.
- **Advisories:** none.
- **Files:**
  - `backend/tests/security/brute-force-limits.test.ts`, `backend/src/middlewares/rate-limiter/tests/` (7 files), `backend/tests/sign-in/session-cap.test.ts`.
  - The limiter family in `backend/src/middlewares/rate-limiter/`: `limiters.ts` (17 exports), `core.ts` (`rateLimiter`, modes `limit`, `success`, `fail`, `failseries`), `helpers.ts` (stores, reserve, pseudonym, `chargeLimiter`), `tiers.ts` (`reserveTiers`, `settleTiers`, `slowTier`), `points-cache.ts` (in-process fast path for `pointsLimiter` and `syncReadLimiter`); `backend/src/modules/auth/rate-limits-db.ts` (table `rate_limits`).
  - Declared in routes through `xRateLimiter` and exported to the OpenAPI document as `x-rate-limiter` (`backend/src/core/openapi-extensions.ts`); `route-guards.test.ts` reads `x-guard` and `x-enabled-by` from `app.getOpenAPI31Document`. `insertEntityLock` is listed as a rate limiter (`backend/src/middlewares/insert-entity-lock.ts`).
  - Limiters outside routes: `serviceBurstLimiter` in `service-guard.ts`; `totp-budget.ts` (account tier); `create-request.ts` (one account-exists mail per address per day); `notify-sign-in.ts` (daily sign-in notice budget per user); `clientMetadataFetchLimiter` through `chargeLimiter`.
- **Holds:**
  - `brute-force-limits`: a magic-link mail flood from new client addresses; the cap telling no account from none and letting the owner sign in; step-up guessing and impersonation refusals not spending the budget; check-email lookups; many accounts from one address, with a shared-address positive control; one account from many addresses; a parallel burst on TOTP; a lockout ended in the database but held in a process; navigation past the budget redirects.
  - `rate-limiter/tests/burst-budgets.test.ts`: a parallel burst cannot pass a failure, send or points budget. `budget-enforcement.test.ts`: tenant budget exact, clamped to the ceiling, 0 means ceiling, no second budget inside a window.
  - `tiers.test.ts`: failures counted in hourly and daily tiers, the 24 h tier holds, a failing store gives no 500 (attempt uncounted), error redirects counted.
  - `identifier-validation.test.ts`: no address in the clear in the key, IPv6 /64 and case share one bucket, an empty key refused. `points-cache.test.ts`: fast-path accounting. `limiter-scope.test.ts`: `chargeLimiter` outside a request refuses.
  - `tests/sign-in/session-cap`: the per-user session cap evicts the oldest sessions, counts MFA sessions, spares impersonation.
  - `tests/tenants` (a retry of `selfCreateTenant` reuses the orphan tenant).
- **Asks:** route x limiter from the OpenAPI document, as route-guards.test does, with the reason each unlimited route is cheap; the store-down decision; budgets against code spaces.
- **Not this class:** entropy and guessability of tokens belong to A1 and A5. The TOTP window and daily restart belong to A3. The stream cap belongs to B4. MCP tool charges belong to B6. Body and batch caps belong to C1. Invitation address takeover belongs to C7. Upload content and size belong to C6.

### E2 Write integrity and the sync engine
- **Gain:** integrity, cross-tenant write.
- **Merges:** `stx` idempotency and a replay by another actor, forged ids or writer fields in mutation variables, `afterSeq` range reads and tombstones, CDC attribution (`stripChangedFields`), outside writes, lenses accepting an old shape, `insertEntityLock`, overlapping edits, immutability triggers, counters, `write_conflict`, embeddings keeping only live ids, soft delete and restore across tenants.
- **Advisories:** none.
- **Files:**
  - `backend/tests/security/attachment-idempotency.test.ts`; in `backend/tests/`: `attachment-overlapping-edits.test.ts`, `attachment-seq-reads.test.ts`, `recalculate-sequence.test.ts`, `filter-existing-product-ids.test.ts`, `catchup-baseline.test.ts`, `catchup-propagation.test.ts`.
  - Schema evolution tests: `shared/src/schema-evolution/tests/{engine,engine-empty,queued-variables}.test.ts` and `backend/src/core/schema-evolution/tests/lens-seam.test.ts`.
  - Immutability tests: `backend/tests/integration/rls-security.test.ts`.
  - `checkIdempotency` is used by `modules/attachment/operations/create-attachments.ts`; `insertEntityLock` by `organization-routes.ts`; `filterExistingProductIds` is defined in `modules/entities/embedding-queries.ts`; `stripChangedFields` is used at four sites. There is no restore route.
- **Holds:**
  - `attachment-idempotency`: user B sending A's mutationId with a new id gets only its own row, stored `createdBy` is B; B sending A's row id gets nothing (`rejectedIds`); the same user with the same ids on another tenant's path gets nothing of the first tenant; a deleted row is not revived; partial and concurrent replays; quota with replays.
  - `attachment-overlapping-edits`: field timestamps of two edits while the row is held.
  - `attachment-seq-reads`: seq order, tombstones, a limit above 1000 refused, `afterSeq` exclusive and `untilSeq` inclusive, `channelId` narrowing.
  - `recalculate-sequence` (counters), `filter-existing-product-ids` (embeddings), `catchup-propagation` (no unreadable row named).
  - `rls-security`: every immutable column, memberships, append-only activities.
  - Lenses: `shared/src/schema-evolution/tests/engine.test.ts` (normalize), `lens-seam.test.ts` (alias accepted, missing HLC refused, an alias cannot replace canonical absence).
- **Asks:** an `stx` replayed as another actor; a create with a client-chosen id already used in another tenant; a lens that widens a shape.
- **Not this class:** replay of a paused mutation by another user on the same device belongs to C8. HLC length, shape, drift and body size caps belong to C1. Tombstone content in range reads belongs to B1. The materialize writer re-check belongs to B5. Request-body key dropping belongs to B3. Tenant quota ceilings and limiter tiers as abuse belong to E1.

### E3 Exceptional conditions, fail-open paths and alerting
- **Gain:** guard bypass under failure, denial of service.
- **Merges:** an exception that ends a worker, fail-open when a dependency is down (the limiter store, a cache, Brevo, S3, Transloadit, the OAuth worker, the relay, CDC lag), a database failure during a second-factor check (holds), `onError` output, health endpoint exposure, migrations swallowing errors, alerts on lockouts and admin sign-ins, OTel export failure.
- **Advisories:** 2 (yaml uncaught exception, node-server unparsable Host).
- **Files:**
  - `shared/src/utils/worker-lifecycle.ts` (`setupGracefulShutdown`), used by `backend/src/main.api.ts`, `cdc/src/index.ts`, `yjs/src/index.ts`, `backend/src/lib/jobs-worker.ts`, the mcp and oauth worker entries; not installed when `inProcess`.
  - Entries: `backend/src/main.ts` (modes, `exitOnStartFailure`), `backend/src/main.api.ts`, `cdc/src/cdc-worker.ts`, `yjs/src/yjs-worker.ts`, `backend/src/main.migrate.ts`.
  - `backend/src/lib/error.ts` (`toClientError`, `appErrorHandler`, pool timeout to 503).
  - Health: `backend/src/lib/{health,health-helpers,health-probe,jobs-health}.ts`, `shared/src/health-app.ts`, `cdc/src/network/health.ts`, `yjs/src/server/ws-server.ts`, `backend/src/modules/oauth-server/server.ts`; tests `backend/tests/health.test.ts`, `backend/tests/health-helpers.test.ts`, `backend/tests/integration/jobs-store.test.ts`.
  - Limiter store failure: `backend/src/middlewares/rate-limiter/{helpers,tiers,core}.ts`.
  - Mail and Matrix: `backend/src/lib/mailer.ts` (`sendBatch`, `postToBrevo`), `backend/src/modules/requests/helpers/send-matrix-message.ts`.
  - Storage: `backend/src/lib/object-storage.ts`, `modules/attachment/helpers/stored-file.ts`, `operations/{create-attachments,link-attachment-keys}.ts`, `signed-url.ts`, `backend/src/lib/transloadit.ts`, `modules/me/operations/get-upload-token.ts`.
  - OAuth: `backend/src/modules/oauth-server/{verify-access-token,keystore,grant-policy}.ts`, `backend/src/middlewares/guard/{token-grant-cache,service-guard}.ts`.
  - Sessions: `backend/src/modules/auth/sessions/operations/{resolve-session,create-session}.ts`, `notify-sign-in.ts`.
  - CDC: `cdc/src/pipeline/{replication,handle-message}.ts`, `cdc/src/services/{flush-buffer,replication-state,failure,setup-check,cdc-metrics,transaction-buffer}.ts`, `cdc/src/network/health-reporter.ts`. Yjs: `yjs/src/server/{upgrade,rate-limiter}.ts`, `yjs/src/data/permissions.ts`.
  - `shared/src/otel.ts`, `shared/src/pino.ts`, `backend/src/lib/tracing.ts`.
  - Migrations: `backend/scripts/migrations/{10-cdc,10-rls,10-immutability,10-unlogged,10-jobs,99-verify}.migration.ts`, `backend/tests/integration/schema-verification.test.ts`.
  - Jobs: `backend/src/lib/{jobs,pg-boss,jobs-worker}.ts`; cron jobs `notification-digest`, `archived-tenants-removal`, `deleted-storage-cleanup` (in `*-module.ts`), `retryLimit: 0`. Retention is the `10-retention.migration.ts` partition procedure; no `sweepRules` job exists in this checkout.
- **Holds:**
  - `step-up-db-failure`: an exhausted pool answers a step-up 503 `service_unavailable` and a deadlock 409 `write_conflict`, the session stays not stepped up, the same proof works after.
  - `server-error-messages`: a failed query in staging, tunnel and production answers `Internal server error` with no SQL (development shows it as control).
  - `tests/health`: a failed job-store read puts `jobs_unreadable` in the anonymous diagnostics, never the query text; shallow is 204, full carries the components; the CDC worker's grade passes through. `tests/health-helpers`: only `api` and `database` reach `unhealthy`; a stale CDC report is never graded better than the worker graded it.
  - `tests/integration/jobs-store`: queues and crons converge as the runtime role, a job runs, `supervise` works, health reads the store.
  - `failed-query-redaction` (D1): logs and spans carry no request value from a failed query.
  - In code: a session read failure stays the request's failure, never "signed out" (`resolve-session.ts`); the cookie is kept on a failed read. Yjs authorization failure closes the socket 4503; its connection limiter refuses on any error. CDC: an unknown flush failure never acknowledges; the setup check keeps the stream stopped while replica identity or the publication is wrong. Mail and Matrix helpers never throw. `@hono/node-server` answers an unparsable Host with 400, not a throw.
- **Asks:** a dependency outage table (dependency -> request outcome -> closed or open -> test); process-level handlers; what pages an operator.
- **Not this class:** limiter budget values and the TOTP guessing ceiling belong to A3. Sign-out ordering belongs to A2. Invitation takeover and TRACE belong to C7. Cache staleness windows and the product cache belong to C8. SQL and secrets in logs belong to D1. Outbound fetch limits and the geoip download belong to C5. Relay tokens and backpressure belong to B5, B4 and C1. Federation address proof belongs to A4. Deploy health gate, rollout and runbooks belong to the infra review.

## F. Platform

### F1 Supply chain and build integrity
- **Gain:** secret exposure, code execution.
- **Merges:** `minimumReleaseAge: 1440`, `blockExoticSubdeps`, `allowBuilds`, the lockfile, `pnpm cella audit`, overrides hygiene, third-party scripts in the browser (Gleap, onedollarstats, Maple), locale and font loading, subresource integrity, base images by digest (infra G12), CI tokens, lefthook.
- **Advisories:** 10 (the 2026 `@tanstack/*` malware release, playwright downloads without certificate verification, otel module generation).
- **Files:**
  - `pnpm-workspace.yaml`: `allowBuilds`, `blockExoticSubdeps`, `minimumReleaseAge` (with an exclude for `@cellajs/cli`), `overrides`, `updateConfig.ignoreDependencies`. No `trustPolicy`, `onlyBuiltDependencies` or `.npmrc`.
  - `package.json` (`packageManager`).
  - `.github/workflows/ci.yml`, `.github/workflows/release.yml` (no `.github/actions`); `lefthook.yaml`.
  - `infra/config/frontend-csp.config.ts`, set by `infra/caddy/Caddyfile` from `{$FRONTEND_CSP}`.
  - Dockerfiles: `Dockerfile`, `infra/boot/Dockerfile`, `infra/caddy/Dockerfile`, `backend/db/Dockerfile`.
  - `pnpm cella audit` lives in `@cellajs/cli` (not in this repo; `cella/SECURITY.md` names it); the repo config is the `updateConfig` block in `pnpm-workspace.yaml`. Root `SECURITY.md` exists.
  - CI has no merge queue (`ci.yml` says so).
- **Holds:**
  - Fresh release blocked: `minimumReleaseAge: 1440` refuses a version published under a day ago.
  - Exotic transitive sources (git, tarball URLs): `blockExoticSubdeps`.
  - Install scripts: only esbuild and lefthook may build; images install with `--ignore-scripts` and `--frozen-lockfile`.
  - CI: `permissions: {}` at the top; jobs `contents: read`; every third-party `uses:` is a 40-character SHA with a tag comment; the trigger is `pull_request` only (no `pull_request_target`); heavy jobs run only for same-repo branches; `privileged-changes` holds no secret.
  - Browser: `script-src 'self' *.gleap.io`, no `unsafe-inline` for scripts, `object-src 'none'`, `font-src 'self' data:`. Fonts are self-hosted (`frontend/index.html`). Gleap, onedollarstats and Maple are npm packages bundled by Vite (`frontend/src/modules/common/gleap-support.ts`, `root.tsx`, `frontend/src/lib/maple.ts`), so they carry lockfile integrity, not a script tag.
  - The infra review (`INFRA_ADVERSARIAL_REVIEW.md`, F2 line on build machine keys, G1, G12), cited and not redone.
  - The workspace settings, the audit and cella#1549.
- **Asks:** an inventory of code that runs from the network at install, build, CI and in the browser, and what a compromised package in each tier reaches (the infra review's F2 line).
- **Not this class:** dev server exposure, Storybook and `.env` on disk belong to F2. Build-machine keys and deploy key handling belong to the infra review (F3). CSP `connect-src` breadth for exfiltration after XSS belongs to C4; here only the third-party script cover is counted.

### F2 Dev-time exposure
- **Gain:** a developer laptop, which the infra review rates as the observer and operator keys (F6, F7).
- **Merges:** the dev server's file access rules, the HMR socket's origin, Storybook code injection from the local network and from a website, `@vitejs/plugin-basic-ssl`, `helpers.fake`, drizzle studio, `.env` on disk, seeded accounts, `--network host`, DNS rebinding against localhost.
- **Advisories:** 149 (vite 118, storybook 21, vitest 8, faker 1, openapi-ts 1).
- **Files:**
  - `frontend/vite.config.ts`: `server.host`, `strictPort`, proxy to `localhost` ports, tunnel-only `allowedHosts` and `hmr`, `basicSsl()` when `frontendUrl` is https and not tunneled; no `server.fs`, no `server.cors`.
  - `frontend/.storybook/main.ts` (`viteFinal` adds a proxy `/api/dev/emails` to the API), `frontend/.storybook/start-storybook.ts` (`storybook dev -p <frontend port + 3006> --quiet --no-open`, no `--host`).
  - `frontend/vitest.config.ts` (storybook project in headless Chromium via the playwright provider).
  - `backend/scripts/drizzle-studio/start.ts`, `port.ts` (port is backend port + 983; runs `drizzle-kit studio --port` with no `--host`; the studio page is a website talking to the local port). The root `package.json` has no `studio` script; it is `studio/package.json` (`pnpm --filter studio dev`).
  - `shared/README.md` (dev ports).
  - `backend/compose.yaml` (services `db`, `db_test`, `db_a11y`; no `network_mode: host`); `backend/.env.example` (postgres superuser, `runtime_role`, `admin_role`).
  - Listeners: API `serveApi` and internal `serveInternal` in `backend/src/lib/listeners.ts` (default `0.0.0.0`), called from `backend/src/main.api.ts`; relay `yjs/src/server/ws-server.ts`; cdc health `cdc/src/index.ts`; mcp `backend/src/modules/mcp/worker/mcp-worker-entry.ts`; jobs health `backend/src/lib/jobs-worker.ts`.
  - Seeds: `backend/scripts/seeds/00-init.seed.ts` (admin user is magic link by email, no password); `backend/scripts/mint-session.ts` (mints a signed cookie, refuses outside development and test); `backend/src/routes.ts` mounts `/dev/emails` whenever mode is not production.
  - `a11y/src/run.ts` (ports shifted by 70, its own database `DB_A11Y_PORT`), `bench/src/config.ts` (default admin URL).
  - `pnpm dev:proxy` in `package.json` filters `--filter proxy`; no `proxy/` directory exists in this checkout.
- **Holds:**
  - Vite's default `allowedHosts` refuses a non-IP, non-localhost `Host`: DNS rebinding of an attacker name to the dev server answers 403.
  - Vite `server.fs.strict: true` and the `.env*`, `*.pem`, `*.key` deny list are the unmodified defaults; `vite.config.ts` does not set `fs`.
  - Vite's HMR upgrade requires a `webSocketToken`, which refuses cross-site socket reads.
  - Storybook binds `127.0.0.1` without `--host` and refuses unknown Host headers.
  - Vitest runs in CI and dev without `--ui` or `api`.
  - The internal listener refuses public peers before any route reads its secret.
  - The mint-session script refuses outside development and test. The seeded admin has no password.
- **Asks:** what `pnpm dev`, `pnpm story` and `pnpm --filter studio dev` bind to (loopback or every interface) and what a malicious page in the developer's browser reaches; one rule; the version minimums. These are the bulk of live advisories over time, so the rule matters more than any single bump.
- **Not this class:** the supply chain of installing these packages, the lockfile, `minimumReleaseAge` and third-party scripts belong to F1. The `/dev/emails` preview route, request handling on the API listener and internal-route secrets belong to the A and C classes (A6 for the address check, B5 for the relay). Vite and Storybook build output shipped to production belongs to F1 and D1.

### F3 Deployment and infrastructure
- **Gain:** none stated; the infra review owns it.
- **Merges:** done by the infra review: `INFRA_ADVERSARIAL_REVIEW.md` (G1 to G13, M1 to M8), cella#1549 and #1550; open items in `INFRA_CONFLICTS.md`.
- **Advisories:** none.
- **Files:** none of its own. Where it meets app code: A6 (the address), C5 (the metadata address, M3), C7 (load balancer prefixes), C6 (bucket policies), F1 (image digests).
- **Holds:** the infra review's own tests and runbooks.
- **Asks:** nothing in this catalog; open items live in the infra review.
- **Not this class:** every app-code question belongs to the class named under Files.

## Classifier rules

The advisory-to-class mapping lives in `tools/classify.mjs` beside this file (by package, then by CWE), and a new advisory enters the class its rule names. An advisory the rules do not place is read by a person.
