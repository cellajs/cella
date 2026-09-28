# Security

This document explains how the app refuses what it must, everywhere: where each security decision is made, what the boundaries are, and how the suite proves that attacks fail.

### TL;DR

Every security decision lives in one place, such as a guard, a policy, a module or a database constraint, never at
each call site, so a new route cannot skip it by omission. Everything fails closed: an unknown tenant, a missing
scope or a missing secret refuses. Every refusal has one shape, and secrets stay out of responses, logs and traces.

## The model

Chokepoints, not call-site checks. A handler never assembles an access by hand (`accessFrom(ctx)`), never ends a session by itself (`endSessions`), never reads a token row (`auth/tokens/`), never lists secret columns (`secret-columns.ts`) and never judges a media URL (`parseMediaRef`); the authorization server has one grant policy (`grantRefusal`). Where a rule must hold for every writer, the database holds it: triggers keep every organization an admin and identity columns immutable. Fail closed: a required ancestor scope that is missing throws, an access scope the vocabulary no longer knows denies, a mode-bound secret that is absent throws in the process that reads it, and a system administrator's role counts only from an allowed address.

Every refusal takes one shape per situation, so no route, app or test meets two answers for one cause: [Permissions, Refusals](./PERMISSIONS.md#refusals). A refusal the caller brought about carries severity `warn`; `error` is kept for the app's own faults. A server error's own message (SQL, parameters, internals) reaches a client in development and test only (`toClientError`); elsewhere the client sees a log id to quote.

## Trust boundaries

| Listener or process | Who reaches it | What it checks |
| --- | --- | --- |
| The public API (`PORT`, under `/api`) | Browsers and machine callers, through the load balancer | A session cookie, an API key or an access token. CSRF on cookie requests: the `Origin` must be the app's; a request carrying an API key skips that check and is refused when it carries a browser `Origin` |
| The internal listener (`INTERNAL_PORT`) | The CDC worker on `/internal/cdc`, the Yjs relay on `/internal/yjs/materialize`, the load balancer's health probe | The peer must be a private-network or loopback address, then each route its own secret: `CDC_SECRET` in `x-cdc-secret`, `YJS_RELAY_SECRET` in `x-yjs-relay-secret` |
| The Yjs relay (`/yjs`) | Editors' WebSockets | A per-entity Ed25519 token the API signed, then the entity row under RLS |
| The authorization server (`/oauth`) | OAuth clients and the consent page | PKCE, client secrets by hash, its own session, the grant policy |
| The MCP endpoint (`/mcp`) | AI clients | Access tokens only |

The public listener has no route under `/internal/*` and answers 404 there, whatever the path's encoding; the infra routes the internal port only from the private network ([Deployment](./DEPLOYMENT.md#overview)). The API is same-origin: there is no CORS middleware, so another origin gets no grant. Who connects to each face and with what: [Interoperability](./INTEROPERABILITY.md); the layers: [Architecture](./ARCHITECTURE.md#trust-boundaries).

## Authorization

A request passes its guards first: `userGuard`, `serviceGuard`, `actorGuard` or `tokenGuard` establish the actor, then `tenantGuard` and `orgGuard` the tenant and organization, each refusing before the handler ([Interoperability, Guards](./INTEROPERABILITY.md#guards)). The handler presents `accessFrom(ctx)` to the permission engine, which decides per action and row, masks the decision by the actor's access scopes and scopes a role that is not elevated to rows homed at its own channel ([Permissions](./PERMISSIONS.md)). PostgreSQL row-level security under `runtime_role` hides other tenants' product rows from an application read that got its scope wrong ([Multi-tenancy](./MULTI_TENANCY.md)). A system administrator is a `system_roles` row the app itself cannot write (the table takes writes from the admin connection alone), and the role counts only from an address in `SYSTEM_ADMIN_IP_ALLOWLIST`.

## Data

| Concern | Chokepoint |
| --- | --- |
| Storage keys | An attachment's keys must lie under `<organizationId>/` (`isOrganizationKey`, `namesOwnStorage`); the presign boundary signs only such a key in an app bucket (`isSignableKey`) and never a `blob:` key; the server decides the bucket per upload template (`uploadStorage`) |
| Media references | One grammar, `parseMediaRef`: an attachment id, a storage key under the document's organization, or an asset URL on `mediaAssetOrigin`. Anything else, an external image URL included, is refused with 400 on save, blanked by the relay and dropped by the renderer |
| Idempotency | `checkIdempotency` finds only the caller's own rows under a mutation id (filter on `createdBy`), so a replay by another actor creates its own rows |
| Secret columns | Declared once in `backend/src/db/secret-columns.ts`: omitted from every response schema, censored in logs, stripped from the CDC row image. TOTP secrets and private signing keys are encrypted at rest under `DATA_ENCRYPTION_KEY` |
| Constraints | Triggers keep identity columns immutable, `activities` append-only and `system_roles` closed to `runtime_role` (`immutability-triggers.ts`); a deferred trigger keeps every organization an admin, answered as 409 `last_admin` (`membership-rules.ts`) |

## Secrets and env

`backend/src/env.ts` validates the environment at boot. A secret that signs or authenticates needs 16 characters (`secretString`); `DATA_ENCRYPTION_KEY` and `YJS_TOKEN_PRIVATE_KEY` 32. `COOKIE_SECRET` takes a comma-separated list for rotation: the first signs, any verifies. Mode-bound secrets (`env-mode-secrets.ts`: `CDC_SECRET`, `YJS_TOKEN_PRIVATE_KEY`, `YJS_RELAY_SECRET`, `UNSUBSCRIBE_SECRET`, `PII_HASH_SECRET`, `ADMIN_EMAIL`) are read through `modeSecret(name)`, which throws in a process whose `MODE` does not receive them, so nothing signs, hashes or compares with a missing key. Infra delivers each runtime secret to the services that consume it and no other (`infra/config/runtime-secrets.config.ts`; a VM's key reads only its own secret folder), and the infra tests pin that mapping to the backend's. The Yjs key pair splits the same way: the API holds the private key and signs editor tokens, the relay holds `YJS_TOKEN_PUBLIC_KEY` and can verify but never mint. `PII_HASH_SECRET` peppers the per-user hashes of IPs and device ids, so a leaked table cannot correlate a browser across accounts. `SYSTEM_ADMIN_IP_ALLOWLIST` defaults to `none`.

## Limits

A route declares its limiter on `createXRoute` with `xRateLimiter: [limiter]`, and the limiter shows in the OpenAPI document. `rateLimiter(mode, key, identifiers)` builds one: the key is composed from `ip` (an IPv6 client counts by its /64), `email`, `userId`, `actorId` or `tenantId`, and the mode says what counts. `limit` counts every request. `success`, `fail` and `failseries` reserve an attempt before the handler runs and give it back unless the outcome is the one they count, so a parallel burst reaches the handler at most the budget's times; a spent budget refuses without counting, and a `failseries` ends with a success. Every failure budget also counts in a 24-hour bucket (`slowTier`): 100 failures block for three hours. Counts and blocks live in the `rate_limits` table, so every process holds the same ones; while the database is unreachable a store falls back to process memory. A refusal is 429 `too_many_requests` with `Retry-After`. Code that has no request of its own, such as the authorization server fetching a client's metadata document, charges a limiter through `chargeLimiter`: 60 fetches per minute per IP. The auth budgets: [Authentication](./AUTHENTICATION.md#rate-limits); the machine ones: [Interoperability](./INTEROPERABILITY.md#quotas-and-limits).

## Telemetry and logs

`scrubUrl` (`shared/src/utils/scrub-url.ts`) redacts the value of every sensitive query key (`token`, `code`, `state`, signed-URL signatures and the like), the secret segment of `/auth/invoke-token/{type}/{token}` and any URL userinfo. Every logger runs it on the `url` it logs, and the redacting span processor runs it on every string of a span before export, so a trace never carries a link's secret. Pino censors the secret columns, the transport keys (`token`, `accessToken`, `codeVerifier` and the like) and the `authorization` and `cookie` headers (`redactPaths`). A failed query is logged and traced with the database's reason alone, never its SQL or values (`failed-query.ts`). The `invoke-token` route answers with `Referrer-Policy: no-referrer`, so the link's secret stays out of the next page's `Referer`. The boot runner and the deploy redact by value every secret they handled ([Infra CLI](../infra/README.md#observability)).

## Realtime

An editor gets a token per entity from the API: Ed25519-signed, five minutes, naming the entity, its tenant and organization, and the user. The relay verifies it with the public key, reads the entity row and the user's memberships under RLS, runs the shared permission engine and closes a refused socket with a code the client understands (`4001` token, `4003` access denied, `4400` bad frame) ([Yjs worker](../yjs/README.md#connection-and-auth)). Materialization posts to the internal listener with `YJS_RELAY_SECRET`, and the backend takes the tenant and organization from the entity row, never from the body. The CDC worker holds one socket to `/internal/cdc` with `CDC_SECRET` and strips the secret columns from every row image before it leaves the worker ([CDC worker](../cdc/README.md#internal-api-channel)). An SSE stream is bound to the session that opened it and closes when that session ends ([Authentication, Sessions](./AUTHENTICATION.md#sessions)).

## Infra and CI

Each VM holds a key of its own that reads only the secrets its services consume. The database sits on the private network, and a break-glass exposure takes an ACL the CLI validates (`infra/lib/db-exposure-acl.ts`): at most a `/24` or a `/48` unless widened on purpose, IPv4-mapped ranges read as IPv4, and never the whole internet ([Deployment](./DEPLOYMENT.md#api-keys)). The scheduled jobs run on one instance at a time: every instance with `RUN_JOBS` contends for a Postgres advisory lock, and the holder runs them (`lib/job-ownership.ts`). In CI, the jobs that hold deploy secrets install only the `infra` and `shared` workspaces, without the shared pnpm cache, and the frontend builds in a job without secrets, because its install scripts run third-party code. The schema-bust gate compares the committed OpenAPI spec against the merge commit's first parent and refuses a breaking change without a `clientCacheVersion` bump ([Schema evolution](./SCHEMA_EVOLUTION.md#cache-bust-interim)).

## Security testing

A security test acts as the attacker and passes only when the app refuses: it asserts the exact refusal, is paired with a positive control, and is named after the attack ([Testing, Goals](./TESTING.md#goals)). The route-level ones live in `backend/tests/security/`, and the broad ones are table-driven over the app itself: `route-guards.test.ts` reads every operation's `x-guard` from the live OpenAPI document and checks that every route without `publicGuard` refuses an anonymous request and every `sysAdminGuard` route refuses a normal user; `cross-tenant.test.ts` and `cross-org.test.ts` try another scope's ids over the id routes; `mass-assignment.test.ts` sends the columns outside each body pick. Every security fix adds the test that reproduces the exploit and is checked by putting the hole back: the smallest change that reopens it must turn a test red. The backend suite also runs as `runtime_role` (`pnpm test:core:runtime`), so RLS is proven against the real role.

## Reporting a vulnerability

Report security issues to [security@cellajs.com](mailto:security@cellajs.com).

Monitoring:

- `pnpm cella audit`: outdated packages, known CVEs, and unneeded `pnpm.overrides`
- `pnpm test:full`: full suite including authentication guards, RBAC, and protected route enforcement

Resources: [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/), [OWASP Top 10](https://owasp.org/Top10/2025/), [Anti-DDoS fundamentals (Scaleway)](https://www.scaleway.com/en/blog/the-fundamentals-of-anti-ddos-protection/).
