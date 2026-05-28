# OWASP Top 10:2025 Security Analysis v2

Code-level audit of the Cella codebase against the [OWASP Top 10:2025](https://owasp.org/Top10/2025/).

**Analysis date**: March 2026

## Executive summary

| Rank | Vulnerability | Status | Risk | Change |
|------|---------------|--------|------|--------|
| A01 | [Broken Access Control](#a01-broken-access-control) | ✅ Strong | Low | — |
| A02 | [Security Misconfiguration](#a02-security-misconfiguration) | ⚠️ Needs Attention | Medium | — |
| A03 | [Injection](#a03-injection) | ⚠️ Needs Attention | Medium-High | NEW |
| A04 | [Cryptographic Failures](#a04-cryptographic-failures) | ✅ Strong | Low | — |
| A05 | [SSRF](#a05-server-side-request-forgery) | ⚠️ Needs Attention | Medium-High | NEW |
| A06 | [Vulnerable Components](#a06-vulnerable-and-outdated-components) | ✅ Good | Low | ⬆️ |
| A07 | [Authentication Failures](#a07-identification-and-authentication-failures) | ✅ Strong | Low | ⬆️ |
| A08 | [Data Integrity Failures](#a08-software-and-data-integrity-failures) | ✅ Strong | Low | — |
| A09 | [Logging & Monitoring Failures](#a09-security-logging-and-monitoring-failures) | ⚠️ Needs Attention | Medium | — |
| A10 | [Exceptional Conditions](#a10-exceptional-conditions) | ✅ Good | Low | ⬆️ |

---

## A01 Broken Access Control

**Status**: ✅ Strong — multi-layered access control with centralized `checkPermission()`, declarative route guards via OpenAPI, PostgreSQL RLS on tenant-scoped tables, hashed session tokens with HttpOnly/Secure cookies, restricted CORS (single origin), CSRF middleware, comprehensive rate limiting, and IP-restricted system admin operations.

### Architecture

- **Guard chain**: `authGuard` → `tenantGuard` → `orgGuard` (sets RLS context per transaction)
- **RLS policies**: `tenantMatch()` on all tenant-scoped tables (tenant-level isolation); `publicOrAuthenticated()` for public routes. Org isolation is app-layer (orgGuard)
- **Permission manager**: `checkPermission()` validates every mutation against role-based `accessPolicies`
- **System admin**: Dual protection — `sysAdminGuard` (role) + `SYSTEM_ADMIN_IP_ALLOWLIST` (network); failed attempts trigger security email

### Verified secure

- All mutation handlers call `canCreateEntity()` or `getValidContextEntity()` before writes
- `baseDb` isolated to non-tenant-scoped ops (auth, users, sessions); `unsafeInternalAdminDb` used only in public handlers
- No raw SQL bypassing Drizzle ORM's parameterized queries (except noted in A03)
- CORS restricted to `appConfig.frontendUrl` with `credentials: true`
- CSRF middleware applied globally: `csrf({ origin: appConfig.frontendUrl })`
- Presigned URLs validated: attachment must exist and user must have `read` permission before signing

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| Task redirect returns routing metadata for any task ID (`redirect-handlers.ts`) | Low | Acceptable — returns non-sensitive routing data only; consider logging all lookups |
| No rate limiting on presigned URL endpoint | Low | Add rate limiter to prevent key enumeration |

---

## A02 Security Misconfiguration

**Status**: ⚠️ Needs Attention — Hono `secureHeaders()` applied but not explicitly configured; Zod-validated env config; signed cookies in production.

### Verified secure

- **Environment validation**: Comprehensive Zod schemas at startup (`env.ts`) — min-length secrets, email format, IP regex, enum constraints
- **Error masking**: 5xx errors return generic "Internal server error" in production; stack traces logged server-side only (`error.ts:187`)
- **Cookie security**: `httpOnly`, `secure` (non-dev), `sameSite: lax`, signed with `COOKIE_SECRET` in production
- **No directory listing**: No `serveStatic` with directory listing
- **Admin endpoints**: All behind `sysAdminGuard` + IP whitelist
- **Debug gating**: `console.debug()` stripped by Terser in production builds

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| Security headers use Hono defaults — CSP, HSTS max-age, Permissions-Policy not explicitly set | Medium | Explicitly configure `secureHeaders()` with CSP, `max-age=31536000; includeSubDomains; preload`, and Permissions-Policy |
| Source maps enabled in production builds (`vite.config.ts:50`) | Medium | Set `sourcemap: false` or use hidden source maps (Sentry-only upload already configured) |
| No application-level HTTPS redirect | Medium | Add redirect middleware or confirm infrastructure enforces it |
| OpenAPI spec publicly accessible at `/openapi.json` | Low | Intentional for API consumers; gate behind auth if not needed publicly |
| `DEV_MODE` defaults to `'core'` | Low | Ensure production deployments explicitly set `DEV_MODE=none` |

---

## A03 Injection

**Status**: ⚠️ Needs Attention — all user-facing queries use Drizzle ORM with parameterized queries and Zod-validated input. However, internal SQL construction and one HTML rendering path use unsafe patterns.

### Verified secure

- **SQL (user-facing)**: All handler queries use Drizzle's `select().from().where()` with parameterized values
- **No command injection**: No `exec()`, `spawn()`, `child_process` with user input
- **No eval()**: No dynamic code execution
- **No XML/LDAP**: No XML parsing or LDAP queries
- **Log injection**: Structured logging via Pino; user input not directly interpolated into log strings
- **Path traversal**: S3-based storage; no `fs.readFile()` on user-controlled paths

### Open concerns

| Issue | Risk | File | Recommendation |
|-------|------|------|----------------|
| `raw()` in redirect HTML bypasses escaping for `redirectUrl` in `<meta>` tag and `<script>` block | Medium | `task/redirect-handlers.ts:178,187` | Replace `raw()` with escaped interpolation; `redirectUrl` is constructed from `appConfig.frontendUrl` so risk is low but pattern is unsafe |
| Dynamic SQL via `sql.raw()` in counter recalculation — role names, table names, FK columns built via string concatenation | Medium | `entities/helpers/recalculate-context-counters.ts`, `recalculate-counters.ts` | Values come from app config (not user input) so not directly exploitable, but violates defense-in-depth; use Drizzle's typed APIs or validate against allowlist |
| Column names in immutability triggers built via string concatenation | Low | `db/immutability-triggers.ts:47-59` | Config-controlled; add allowlist validation for column names |
| `dangerouslySetInnerHTML` in BlockNote editor and code viewer | Low | `blocknote/full-html.tsx:165`, `minimal-html.tsx:25`, `code-viewer.tsx:49` | Upstream sanitization (BlockNote, Shiki) is trusted; consider adding DOMPurify as defense-in-depth |
| Email `to`/`replyTo` fields not sanitized for CRLF injection | Low | `lib/mailer.ts:73-74` | Values come from JWT/config; add `sanitizeEmailSubject()`-style stripping for defense-in-depth |

---

## A04 Cryptographic Failures

**Status**: ✅ Strong — SHA-256 hashed session tokens, `crypto.getRandomValues()` for all token generation, TOTP via oslo (160-bit secrets), HMAC-SHA384 Transloadit signing, HMAC-SHA256 cache tokens with `timingSafeEqual()`, signed cookies.

### Verified secure

- **Token generation**: `nanoid(40)` backed by `crypto.getRandomValues()` — no `Math.random()`
- **TOTP secrets**: 20-byte `crypto.getRandomValues()` with Base32 encoding
- **Passkey challenges**: 32-byte `crypto.getRandomValues()`
- **Cookie signing**: HMAC-SHA256 via Hono's `setSignedCookie()` in production
- **Transloadit**: HMAC-SHA384 request signing
- **Cache tokens**: HMAC-SHA256 with `timingSafeEqual()` comparison
- **No weak algorithms**: No MD5, SHA1, DES, or RC4 detected

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| TOTP secrets stored unencrypted in DB (`db/schema/totps.ts`) | Medium | Encrypt at rest with application-level envelope encryption |
| Auth tokens stored unencrypted in DB (`db/schema/tokens.ts`) | Low | Tokens are short-lived (2h–5min) with hashed lookup; encryption would add defense-in-depth |

---

## A05 Server-Side Request Forgery

**Status**: ⚠️ Needs Attention — OAuth provider fetches use hardcoded URLs (safe), but two vectors allow attacker-influenced URLs.

### Verified secure

- **OAuth provider fetches**: Hardcoded to `api.github.com`, `googleapis.com`, `graph.microsoft.com`
- **Redirect validation**: `isRedirectUrl()` enforces relative paths only, blocks `/api/` prefix
- **Block URL validation**: `validateBlockUrls()` checks media URLs against CDN/domain allowlist

### Open concerns

| Issue | Risk | File | Recommendation |
|-------|------|------|----------------|
| **OAuth open redirect**: `parsedState.redirectUrl` from base64-decoded OAuth state is used in `ctx.redirect()` without domain validation | High | `auth/oauth/oauth-handlers.ts:113-115` | Validate `redirectUrl` starts with `appConfig.frontendUrl` or is a relative path |
| **SSRF via avatar URL**: `loadImage(avatarUrl)` in cover generation fetches user-controlled `thumbnailUrl` without URL validation | Medium | `task/helpers/canvas.ts:66` | Validate against CDN allowlist; block private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16) |
| Matrix API token passed in URL query parameter | Low | `lib/notifications/send-matrix-message.ts:40` | Move access token to `Authorization` header |
| DNS lookup on user-provided domain without rate limiting | Low | `domains/domains-handlers.ts:126-139` | Add rate limiter; domain ownership already required via tenant |

---

## A06 Vulnerable and Outdated Components

**Status**: ✅ Good — lockfile enforced in CI (`--frozen-lockfile`), security overrides in place, no external CDN scripts.

### Verified secure

- **Lockfile**: `pnpm-lock.yaml` enforced with `--frozen-lockfile` in CI (`.github/workflows/ci.yml:43`)
- **Node.js**: Pinned to 24.x; pnpm pinned to 10.30.3
- **Security patches**: `pnpm.overrides` applied for known CVEs — hono, dompurify, undici, esbuild, seroval, jspdf, fast-xml-parser
- **Custom patches**: `dexie@4.3.0` patched via `patches/` directory
- **No CDN scripts**: All dependencies managed through pnpm
- **Key packages current**: `@oslojs/*@^1.0.x`, `rate-limiter-flexible@^10.0.1`

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| No automated vulnerability scanning in CI | High | Add `pnpm audit` step or Dependabot/Snyk |
| No SBOM generation | Medium | Add CycloneDX SBOM on release |
| Caret versioning throughout | Low | Lockfile mitigates this; consider exact pinning for critical security packages |

---

## A07 Identification and Authentication Failures

**Status**: ✅ Strong — multi-strategy auth (magic link, OAuth, TOTP, passkeys), comprehensive rate limiting with dual-layer brute force detection, secure session management, email enumeration protection.

### Verified secure

- **Brute force**: Dual-layer rate limiting — fast (10 failures/hour → 30min block) + slow (100 failures/day → 3h block); email+IP combo tracking
- **Sessions**: `nanoid(40)`, hashed in DB, 1-week expiry, fresh session on every login (no fixation), explicit deletion on logout
- **OAuth CSRF**: `generateState()` stored in HttpOnly cookie + validated on callback; PKCE for Google/Microsoft
- **MFA**: TOTP + passkeys; MFA cannot be skipped when `mfaRequired=true`; 10-minute MFA token window
- **Email enumeration**: Restricted mode returns idempotent responses (204/201) when IP is rate-limited
- **Lockout notification**: Security email sent to user on lockout
- **Token storage**: HttpOnly cookies only; no localStorage/sessionStorage for auth tokens

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| No HIBP (Have I Been Pwned) password breach checking | Medium | Integrate HIBP API alongside zxcvbn |
| No MFA backup codes | Medium | Generate backup codes during TOTP setup for recovery without device |
| No concurrent session limit | Low | Intentional for multi-device; consider optional per-user cap |
| Session not rotated after password change | Low | Invalidate other sessions on password change |

---

## A08 Software and Data Integrity Failures

**Status**: ✅ Strong — CI/CD uses SHA-pinned actions, signed cookies with versioning, Transloadit HMAC-SHA384 signing, frozen lockfile, Drizzle-generated type-safe migrations.

### Verified secure

- **CI/CD**: GitHub Actions pinned to commit SHAs; secrets injected via `${{ secrets.* }}`; environment-based deployment gates
- **Cookies**: Signed in production with `COOKIE_SECRET`; versioned via `appConfig.cookieVersion` for rotation
- **Cache tokens**: Additional HMAC-SHA256 signing with `timingSafeEqual()`
- **Migrations**: Drizzle ORM generates type-safe SQL; no raw SQL in migration files
- **No auto-update**: No self-update features
- **Deserialization**: All user input validated through Zod schemas before processing

### Open concerns

None identified.

---

## A09 Security Logging and Monitoring Failures

**Status**: ⚠️ Needs Attention — good request logging and error tracking, but gaps in security event auditing and no alerting.

### What is logged

- User sign-ins with strategy (`session.ts:98`)
- System admin access with security email (`session.ts:50`)
- Rate limiter lockouts with email notification (`limiters.ts:18-30`)
- Impersonation start/stop events
- Token invocations
- Request method, URL, status, response time, user ID (Pino)
- Errors to Sentry with severity classification

### Sensitive data redaction

- Pino redacts: `**.secret`, `**.hashedPassword`, `**.credentialId`, `req.headers.authorization`, `req.headers.cookie`

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| No persistent security audit log — activities table tracks entity changes only, not security events | Medium | Create `audit_events` table for logins, permission denials, MFA events, admin actions, password changes |
| No alerting on suspicious activity | Medium | Alert on: multiple failed logins, rate limit blocks, admin endpoint access, unusual patterns |
| RLS-level permission denials not logged at application level | Low | Log when `checkPermission()` returns denied |
| Bulk operations don't log individual item IDs | Low | Add item-level audit for batch create/delete |
| File-based logs are mutable; no external audit sink | Low | Forward security logs to external immutable store |

---

## A10 Exceptional Conditions

**Status**: ✅ Good — centralized `AppError` handler with Sentry integration, global process-level exception handlers, fail-closed auth guards.

### Verified secure

- **Global error handler**: Catches `AppError`, `HTTPException`, PostgreSQL errors; maps error codes; sanitizes responses in production
- **Process handlers**: `unhandledRejection`, `uncaughtException`, and `SIGTERM` all handled (`main.ts`)
- **Pagination limits**: `paginationQuerySchema` with max `limit` and `offset` enforced via Zod
- **Rate limiting ceiling**: Global `pointsLimiter` at 5000 points/hour
- **Frontend error boundaries**: Root + app + public error boundaries with optimistic update rollback

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| No graceful connection draining on SIGTERM — in-flight requests may be aborted | Low | Add drain period before `process.exit()` (close DB pools, stop accepting new connections) |
| Silent `.catch(() => {})` on lockout email send (`limiters.ts:32`) | Low | Replace with `.catch(err => logEvent('warn', ...))` so failures are visible |
| Other empty catches (URL parsing, cookie parsing, event detection) are intentional fallbacks | Informational | Acceptable — all have clear fallback behavior |

---

## Priority action items

### High

1. **Fix OAuth open redirect** — validate `redirectUrl` in state against `appConfig.frontendUrl` (`oauth-handlers.ts:113-115`)
2. **Fix SSRF in cover generation** — validate `avatarUrl` against CDN allowlist and block private IPs (`canvas.ts:66`)
3. **Add dependency vulnerability scanning** — `pnpm audit` in CI or Dependabot/Snyk
4. **Explicitly configure security headers** — CSP, HSTS (1 year + preload), Permissions-Policy

### Medium

5. **Create security audit log table** — track logins, permission denials, MFA events, admin actions
6. **Add alerting** on rate limit blocks, failed auth attempts, admin access
7. **Encrypt TOTP secrets at rest** in database
8. **Disable production source maps** or use hidden source maps
9. **Add HIBP breach checking** to password validation
10. **Implement MFA backup codes**

### Low

11. Parameterize internal SQL in counter recalculation helpers (defense-in-depth)
12. Add DOMPurify as defense-in-depth for `dangerouslySetInnerHTML` usage
13. Move Matrix access token from URL to Authorization header
14. Add graceful shutdown with connection draining
15. Replace silent `.catch(() => {})` with logged warnings

---

## References

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
