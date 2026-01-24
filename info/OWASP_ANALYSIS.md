# OWASP Top 10:2025 Security Analysis

This document provides a comprehensive security analysis of the Cella codebase against the [OWASP Top 10:2025](https://owasp.org/Top10/2025/) vulnerabilities.

**Analysis Date**: January 2026  
**OWASP Version**: 2025

---

## Executive Summary

| Rank | Vulnerability | Status | Risk Level |
|------|---------------|--------|------------|
| A01 | [Broken Access Control](#a012025-broken-access-control) | ✅ Strong | Low |
| A02 | [Security Misconfiguration](#a022025-security-misconfiguration) | ⚠️ Needs Attention | Medium |
| A03 | [Software Supply Chain Failures](#a032025-software-supply-chain-failures) | ⚠️ Needs Attention | Medium-High |
| A04 | [Cryptographic Failures](#a042025-cryptographic-failures) | ✅ Strong | Low |
| A05 | [Injection](#a052025-injection) | ✅ Strong | Low |
| A06 | [Insecure Design](#a062025-insecure-design) | ⚠️ Needs Attention | Medium |
| A07 | [Authentication Failures](#a072025-authentication-failures) | ⚠️ Needs Attention | Medium-High |
| A08 | [Software or Data Integrity Failures](#a082025-software-or-data-integrity-failures) | ✅ Good | Low |
| A09 | [Security Logging & Alerting Failures](#a092025-security-logging--alerting-failures) | ⚠️ Needs Attention | Medium |
| A10 | [Mishandling of Exceptional Conditions](#a102025-mishandling-of-exceptional-conditions) | ⚠️ Needs Attention | Medium |

---

## A01:2025 Broken Access Control

**Overall Status**: ✅ Strong

Cella implements a well-designed, multi-layered access control system with centralized permission management and consistent backend enforcement.

### ✅ Strengths

| Practice | Location | Description |
|----------|----------|-------------|
| Centralized permission system | [backend/src/permissions/](backend/src/permissions/) | Hierarchical permission manager with action-based policies (create, read, update, delete) |
| Route guards | [backend/src/middlewares/guard/](backend/src/middlewares/guard/) | Guards enforced via OpenAPI route definitions (`isAuthenticated`, `hasOrgAccess`, `hasSystemAccess`) |
| Session security | [backend/src/modules/auth/session.ts](backend/src/modules/auth/session.ts) | Tokens hashed before storage, HttpOnly/Secure cookies, proper expiration |
| CORS protection | [backend/src/server.ts](backend/src/server.ts) | Single origin (not wildcard), credentials enabled properly |
| CSRF protection | [backend/src/server.ts](backend/src/server.ts) | Hono CSRF middleware enabled |
| Rate limiting | [backend/src/lib/rate-limiter.ts](backend/src/lib/rate-limiter.ts) | Comprehensive rate limiting for auth, uploads, token operations |
| IP restriction | [backend/src/middlewares/guard/system-guard.ts](backend/src/middlewares/guard/system-guard.ts) | System admin operations require IP whitelist |

### ⚠️ Potential Concerns

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| User update endpoint relies on guard only | [backend/src/modules/users/handlers.ts](backend/src/modules/users/handlers.ts) | Low | Add defensive ownership check as defense-in-depth |
| Presigned URL permission logic inline | [backend/src/modules/general/system-handlers.ts](backend/src/modules/general/system-handlers.ts#L192) | Medium | Move permission check to guard for consistency |
| Attachment redirect public access | [backend/src/modules/attachments/routes.ts](backend/src/modules/attachments/routes.ts) | Low | Review for metadata leakage |
| Delete users inline permission check | [backend/src/modules/users/handlers.ts](backend/src/modules/users/handlers.ts) | Low | Standardize to use centralized permission system |

### Recommendations

1. **High Priority**: Review presigned URL logic for potential path traversal or bucket confusion attacks
2. **Medium Priority**: Standardize permission checks - move inline role checks to centralized permission system
3. **Low Priority**: Add integration tests for permission boundaries

---

## A02:2025 Security Misconfiguration

**Overall Status**: ⚠️ Needs Attention

Good security headers and CORS configuration, but some configuration issues need addressing.

### ✅ Strengths

| Practice | Location | Description |
|----------|----------|-------------|
| Security headers | [backend/src/server.ts](backend/src/server.ts) | Hono `secureHeaders` middleware applied |
| Production security headers | [render.yaml](render.yaml) | CSP, HSTS, X-Frame-Options, X-Content-Type-Options configured |
| Cookie security | [backend/src/modules/auth/helpers/cookies.ts](backend/src/modules/auth/helpers/cookies.ts) | HttpOnly, Secure (production), SameSite |
| Environment validation | [backend/src/env.ts](backend/src/env.ts) | `@t3-oss/env-core` with Zod validation for required secrets |
| CORS restricted | [backend/src/server.ts](backend/src/server.ts) | Single origin, not wildcard |

### 🔴 Critical Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Stack traces in API responses | [backend/src/middlewares/error-handler.ts](backend/src/middlewares/error-handler.ts) | High | Never include stack traces in client responses |
| Hardcoded API keys | [config/default.ts](config/default.ts), [config/production.ts](config/production.ts) | High | Move to environment variables |

### ⚠️ Medium Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| HSTS max-age too short | [render.yaml](render.yaml) | Medium | Increase from 6 months to 1 year (31536000) |
| Wildcard in example | [backend/.env.example](backend/.env.example) | Medium | Change `REMOTE_SYSTEM_ACCESS_IP=*` to specific IP |
| Weak example secrets | [backend/.env.example](backend/.env.example) | Medium | Add validation or stronger placeholders |
| Debug mode in example | [frontend/.env.example](frontend/.env.example) | Low | Set `VITE_DEBUG_MODE=false` by default |
| Sourcemaps always enabled | [frontend/vite.config.ts](frontend/vite.config.ts) | Low | Disable for production or restrict access |
| API docs always exposed | [backend/src/docs/openapi.ts](backend/src/docs/openapi.ts) | Low | Consider auth or disabling in production |

---

## A03:2025 Software Supply Chain Failures

**Overall Status**: ⚠️ Needs Attention

Good lockfile integrity but lacking vulnerability scanning and SBOM practices.

### ✅ Strengths

| Practice | Location | Description |
|----------|----------|-------------|
| pnpm with lockfile | [pnpm-lock.yaml](pnpm-lock.yaml) | Lockfile version 9.0 with checksum validation |
| Frozen lockfile in CI | [.github/workflows/ci.yml](.github/workflows/ci.yml) | `pnpm install --frozen-lockfile` ensures integrity |
| No external CDN scripts | [frontend/index.html](frontend/index.html) | All resources self-hosted (fonts, icons) |
| Minimal CI permissions | [.github/workflows/ci.yml](.github/workflows/ci.yml) | `contents: read` by default |
| Controlled post-install | [prepare.js](prepare.js) | Limited to Lefthook and Biome extension |
| Knip for unused deps | [knip.json](knip.json) | Dead code/unused dependency detection |

### 🔴 Critical Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| No vulnerability scanning | N/A | High | Add `npm audit`, Snyk, or Dependabot |
| No SBOM generation | N/A | Medium | Add CycloneDX SBOM generation on release |

### ⚠️ Medium Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Caret versioning throughout | [package.json](package.json) files | Medium | Consider exact pinning for production deps |
| GitHub Actions use tags not SHAs | [.github/workflows/ci.yml](.github/workflows/ci.yml) | Medium | Pin to commit SHAs for supply chain protection |
| Large dependency surface | All package.json | Medium | ~200+ direct dependencies, 24k lines in lockfile |

### Recommendations

1. **Critical**: Add `.github/dependabot.yml` for automated dependency updates
2. **Critical**: Add vulnerability scanning step in CI (npm audit or Snyk)
3. **High**: Generate SBOM on release using `@cyclonedx/cli`
4. **Medium**: Pin GitHub Actions to SHA (e.g., `actions/checkout@abc123`)

---

## A04:2025 Cryptographic Failures

**Overall Status**: ✅ Strong

Excellent password hashing with Argon2id and proper token generation.

### ✅ Strengths

| Practice | Location | Description |
|----------|----------|-------------|
| Argon2id password hashing | [backend/src/lib/password.ts](backend/src/lib/password.ts) | OWASP-recommended algorithm with proper parameters (19MB memory, 2 iterations) |
| Secret pepper | [backend/src/lib/password.ts](backend/src/lib/password.ts) | `ARGON_SECRET` used as pepper for additional security |
| Cryptographic token generation | [backend/src/lib/nanoid.ts](backend/src/lib/nanoid.ts) | nanoid uses `crypto.getRandomValues` internally |
| Session tokens hashed | [backend/src/modules/auth/helpers/tokens.ts](backend/src/modules/auth/helpers/tokens.ts) | SHA-256 hashed before database storage |
| TOTP implementation | [backend/src/modules/auth/totp/helpers.ts](backend/src/modules/auth/totp/helpers.ts) | Web Crypto API with 20-byte secret (160 bits) |
| Passkey challenges | [backend/src/modules/auth/passkeys/helpers.ts](backend/src/modules/auth/passkeys/helpers.ts) | 32-byte challenges (256 bits) |
| No weak algorithms | Codebase-wide | No MD5/SHA1 used for security purposes |
| Log redaction | [backend/src/table-config.ts](backend/src/table-config.ts) | Sensitive fields redacted from logs |
| Secure cookie signing | [backend/src/modules/auth/helpers/cookies.ts](backend/src/modules/auth/helpers/cookies.ts) | Signed cookies in production |

### ⚠️ Minor Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Timing-vulnerable comparison | [backend/src/utils/unsubscribe.ts](backend/src/utils/unsubscribe.ts) | Very Low | Use `timingSafeEqual` for token comparison |
| No encryption at rest for TOTP secrets | Database | Low-Medium | Consider encrypting TOTP secrets at rest |
| HTTPS enforcement infrastructure-level | N/A | Low | Document that HTTPS is expected at infrastructure level |

---

## A05:2025 Injection

**Overall Status**: ✅ Strong

Excellent use of Drizzle ORM with parameterized queries and comprehensive Zod validation.

### ✅ Strengths

| Practice | Location | Description |
|----------|----------|-------------|
| Drizzle ORM exclusive use | All handlers | Parameterized queries by default |
| Zod validation on all routes | [backend/src/modules/*/schema.ts](backend/src/modules/) | Comprehensive input validation via OpenAPI |
| No raw SQL with user input | Codebase-wide | All `sql.raw()` uses are from config, not user input |
| No eval/Function usage | Codebase-wide | No dangerous dynamic code execution |
| No command injection surface | Codebase-wide | No exec/spawn in production code |
| ILIKE properly parameterized | [backend/src/utils/sql.ts](backend/src/utils/sql.ts) | Search values parameterized through Drizzle |

### ⚠️ Minor Concerns

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Newsletter admin HTML content | [backend/emails/templates/newsletter.tsx](backend/emails/templates/newsletter.tsx) | Low | Admin-only, acceptable for admin-generated content |
| Frontend dangerouslySetInnerHTML | Limited usage | Low | Shiki output (sanitized), application-controlled CSS only |

---

## A06:2025 Insecure Design

**Overall Status**: ⚠️ Needs Attention

Good rate limiting on auth endpoints but gaps in file upload validation and business logic limits.

### ✅ Strengths

| Practice | Location | Description |
|----------|----------|-------------|
| Auth rate limiting | [backend/src/lib/rate-limiter.ts](backend/src/lib/rate-limiter.ts) | Comprehensive limiters for email, password, token, TOTP, passkey |
| Slow brute force detection | [backend/src/lib/rate-limiter.ts](backend/src/lib/rate-limiter.ts) | 24-hour window, 100 requests, 3-hour block |
| Organization creation limit | [backend/src/modules/organizations/handlers.ts](backend/src/modules/organizations/handlers.ts) | 5 organizations per user |
| Request body limits | [backend/src/server.ts](backend/src/server.ts) | 1MB JSON, 20MB multipart |
| Secure defaults | [backend/src/server.ts](backend/src/server.ts) | Secure headers, CORS restricted, CSRF enabled |
| Default role is member | [backend/src/modules/memberships/handlers.ts](backend/src/modules/memberships/handlers.ts) | Invitations default to `member`, not `admin` |

### ⚠️ Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| No backend file type validation | [backend/src/modules/attachments/handlers.ts](backend/src/modules/attachments/handlers.ts) | Medium | Verify uploaded file content matches declared type |
| No rate limiting on bulk operations | Membership, attachment routes | Medium | Add rate limiters to bulk endpoints |
| No storage quota enforcement | Organization restrictions | Low | Track and limit total storage per organization |
| Unlimited invitation quota | [backend/src/modules/memberships/handlers.ts](backend/src/modules/memberships/handlers.ts) | Low | Limit daily/weekly invitation count per admin |
| userFlags direct merge | [backend/src/modules/me/handlers.ts](backend/src/modules/me/handlers.ts) | Low | Ensure only expected flag keys can be set |
| Presigned URL public access | [backend/src/modules/general/system-routes.ts](backend/src/modules/general/system-routes.ts) | Low-Medium | Review public bucket access requirements |

---

## A07:2025 Authentication Failures

**Overall Status**: ⚠️ Needs Attention

Good MFA implementation and rate limiting, but weak password policy and account enumeration issues.

### ✅ Strengths

| Practice | Location | Description |
|----------|----------|-------------|
| Hashed session tokens | [backend/src/modules/auth/session.ts](backend/src/modules/auth/session.ts) | SHA-256 hashed before storage |
| Device metadata tracking | [backend/db/schema/sessions.ts](backend/src/db/schema/sessions.ts) | Sessions include device info |
| Session invalidation on logout | [backend/src/modules/auth/handlers.ts](backend/src/modules/auth/handlers.ts) | Proper sign-out implementation |
| TOTP MFA | [backend/src/modules/auth/totp/](backend/src/modules/auth/totp/) | HOTP library with 30s interval, rate limited |
| Passkeys (WebAuthn) | [backend/src/modules/auth/passkeys/](backend/src/modules/auth/passkeys/) | Full WebAuthn implementation |
| OAuth PKCE | [backend/src/modules/auth/oauth/](backend/src/modules/auth/oauth/) | Code verifier for Google/Microsoft |
| OAuth state validation | [backend/src/modules/auth/oauth/](backend/src/modules/auth/oauth/) | CSRF protection via state parameter |
| Single-use password reset tokens | [backend/src/modules/auth/handlers.ts](backend/src/modules/auth/handlers.ts) | 2-hour expiry, invoked tokens get 5-min window |
| Login rate limiting | [backend/src/lib/rate-limiter.ts](backend/src/lib/rate-limiter.ts) | 10 failures → 30 min block |

### 🔴 Critical Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Account enumeration | [backend/src/modules/auth/handlers.ts](backend/src/modules/auth/handlers.ts) | High | Use generic "Invalid credentials" for all auth failures |
| Weak password policy | [backend/src/schemas/user.ts](backend/src/schemas/user.ts) | High | Only 8-char minimum; add complexity rules and breach database check |

### ⚠️ Medium Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| No session refresh mechanism | [backend/src/modules/auth/session.ts](backend/src/modules/auth/session.ts) | Medium | Implement sliding sessions or refresh tokens |
| No MFA recovery (backup codes) | MFA implementation | Medium | Implement backup codes if user loses authenticator |
| Password strength UI-only | [frontend/src/modules/auth/zxcvbn.ts](frontend/src/modules/auth/zxcvbn.ts) | Medium | Enforce minimum zxcvbn score on backend |
| 1-week session duration | [backend/src/modules/auth/session.ts](backend/src/modules/auth/session.ts) | Low | May be long for sensitive applications |

### Account Enumeration Details

Current error responses reveal user existence:
- `404 not_found` = email doesn't exist
- `403 invalid_password` = email exists, wrong password
- `403 no_password_found` = email exists, OAuth-only account
- `404 invalid_email` = password reset with non-existent email

---

## A08:2025 Software or Data Integrity Failures

**Overall Status**: ✅ Good

Strong cookie signing and upload integrity, with some JSON parsing validation gaps.

### ✅ Strengths

| Practice | Location | Description |
|----------|----------|-------------|
| Signed cookies in production | [backend/src/modules/auth/helpers/cookies.ts](backend/src/modules/auth/helpers/cookies.ts) | Hono signed cookies with `COOKIE_SECRET` |
| Cookie versioning | [backend/src/modules/auth/helpers/cookies.ts](backend/src/modules/auth/helpers/cookies.ts) | Version number enables rotation |
| Transloadit HMAC signing | [backend/src/lib/storage.ts](backend/src/lib/storage.ts) | HMAC-SHA384 signature with nonce and expiration |
| Lockfile integrity in CI | [.github/workflows/ci.yml](.github/workflows/ci.yml) | Frozen lockfile with hash-based caching |
| No external scripts | [frontend/index.html](frontend/index.html) | All resources bundled via Vite |
| Cookie schema parsing | [backend/src/modules/auth/helpers/cookies.ts](backend/src/modules/auth/helpers/cookies.ts) | Zod validation for cookie payloads |
| CDN URL validation | [backend/src/utils/cdn.ts](backend/src/utils/cdn.ts) | Rejects non-CDN URLs |

### ⚠️ Minor Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Frontend JSON parsing without validation | [frontend/src/modules/common/sse.ts](frontend/src/modules/common/sse.ts), activity-bus.tsx | Low | Add Zod `safeParse` for SSE/WebSocket messages |
| OAuth cookie content not schema-validated | [backend/src/modules/auth/oauth/helpers.ts](backend/src/modules/auth/oauth/helpers.ts) | Low | Add Zod schema for OAuth cookie payload |
| GitHub Actions use tags not SHAs | [.github/workflows/ci.yml](.github/workflows/ci.yml) | Medium | Consider SHA pinning for supply chain protection |
| No artifact signing | N/A | Low | Consider cosign/sigstore for container signing |

---

## A09:2025 Security Logging & Alerting Failures

**Overall Status**: ⚠️ Needs Attention

Good logging foundation but significant gaps in security event logging and alerting.

### ✅ Strengths

| Practice | Location | Description |
|----------|----------|-------------|
| Pino structured logging | [backend/src/pino.ts](backend/src/pino.ts) | Battle-tested library with JSON output |
| Log redaction | [backend/src/table-config.ts](backend/src/table-config.ts) | Sensitive fields redacted (passwords, tokens, secrets) |
| Success events logged | Various handlers | Sign-in, sign-out, impersonation, password reset |
| Sentry integration | [backend/src/middlewares/error-handler.ts](backend/src/middlewares/error-handler.ts) | Error tracking for error/fatal severity |
| Activities table | [backend/src/db/schema/activities.ts](backend/src/db/schema/activities.ts) | CDC-based audit for data changes |

### 🔴 Critical Gaps

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Login failures not logged | [backend/src/modules/auth/handlers.ts](backend/src/modules/auth/handlers.ts) | High | Add explicit logging for authentication failures with IP |
| No security event alerting | N/A | High | Integrate alerts (Novu/Slack) for critical security events |

### ⚠️ Medium Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Permission denied not security-logged | Handler errors | Medium | Log permission denials with user context |
| MFA failures not logged | TOTP/Passkey handlers | Medium | Log failed MFA attempts |
| Rate limit triggers not logged | [backend/src/lib/rate-limiter.ts](backend/src/lib/rate-limiter.ts) | Medium | Log when accounts are rate-limited |
| No security event categorization | Logging infrastructure | Medium | Create security-specific log type |
| Log injection uncertain | User input logging | Low | Add sanitization for user-controlled strings in logs |
| No log integrity protection | N/A | Low | Consider immutable log storage |

### Logged Events Summary

| Event | Logged? |
|-------|---------|
| Sign in success | ✅ Yes |
| Sign out | ✅ Yes |
| Impersonation start/stop | ✅ Yes |
| User self-delete | ✅ Yes |
| Password reset sent | ✅ Yes |
| OAuth redirect | ✅ Yes |
| **Login failures** | ❌ No |
| **Permission denied** | ❌ No (only thrown as error) |
| **MFA failures** | ❌ No |
| **Account lockouts** | ❌ No |
| **Admin role changes** | ❌ No |

---

## A10:2025 Mishandling of Exceptional Conditions

**Overall Status**: ⚠️ Needs Attention

Good global error handler and frontend error boundaries, but some concerns with error exposure and empty catch blocks.

### ✅ Strengths

| Practice | Location | Description |
|----------|----------|-------------|
| Centralized error handler | [backend/src/middlewares/error-handler.ts](backend/src/middlewares/error-handler.ts) | Global handler with AppError class, Sentry integration |
| Custom AppError class | [backend/src/lib/errors.ts](backend/src/lib/errors.ts) | Structured error with status, type, severity, entityType |
| Fail-closed authentication | [backend/src/middlewares/guard/authenticated-guard.ts](backend/src/middlewares/guard/authenticated-guard.ts) | Fails closed on session validation failure |
| Fail-closed authorization | [backend/src/middlewares/guard/org-guard.ts](backend/src/middlewares/guard/org-guard.ts) | Denies by default when no permission |
| Resource cleanup | Various files | Finally blocks used for cookie cleanup, Sentry spans |
| WebSocket cleanup | [backend/src/modules/general/sse-handlers.ts](backend/src/modules/general/sse-handlers.ts) | Proper cleanup on error |
| Frontend error boundaries | [frontend/src/routes/general/error-notice.tsx](frontend/src/routes/general/error-notice.tsx) | Root, app, and public layout boundaries |
| Frontend API error handler | [frontend/src/query/query-client.ts](frontend/src/query/query-client.ts) | Global QueryClient error handling |
| Optimistic update rollback | [frontend/src/modules/attachments/query-mutations.ts](frontend/src/modules/attachments/query-mutations.ts) | Rollback on mutation failure |

### 🔴 Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Stack traces in responses | [backend/src/middlewares/error-handler.ts](backend/src/middlewares/error-handler.ts) | High | Never include stack traces in client responses in production |
| Detailed error info returned | [backend/src/middlewares/error-handler.ts](backend/src/middlewares/error-handler.ts) | High | Remove userId, organizationId, path from client responses |

### ⚠️ Medium Issues

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Empty catch blocks (9 instances) | Various files | Medium | Add logging or proper error handling |
| No database transactions | Various handlers | Medium | Wrap multi-step operations in transactions |
| Missing SIGTERM/SIGINT handlers | [backend/src/index.ts](backend/src/index.ts) | Medium | Add graceful shutdown handlers |
| No unhandledRejection handler | [backend/src/index.ts](backend/src/index.ts) | Medium | Add process-level error handlers |

### Empty Catch Block Locations

These files have empty catch blocks that silently swallow errors:
- `backend/src/lib/rate-limiter.ts` (URL parsing fallback)
- `backend/src/middlewares/guard/authenticated-guard.ts` (session cookie parsing)
- `backend/src/middlewares/body.ts` (JSON body parsing)
- `frontend/src/lib/url-sanitizer.ts` (URL sanitization)

---

## Priority Action Items

### 🔴 Critical (Address Immediately)

1. **Remove stack traces from production error responses** - [backend/src/middlewares/error-handler.ts](backend/src/middlewares/error-handler.ts)
2. **Fix account enumeration** - Use generic error messages for auth failures in [backend/src/modules/auth/handlers.ts](backend/src/modules/auth/handlers.ts)
3. **Add dependency vulnerability scanning** - Add Dependabot or Snyk to CI
4. **Strengthen password policy** - Add complexity requirements in [backend/src/schemas/user.ts](backend/src/schemas/user.ts)
5. **Move hardcoded API keys to environment** - [config/default.ts](config/default.ts), [config/production.ts](config/production.ts)

### ⚠️ High Priority

6. **Log authentication failures** - Add explicit security logging for failed logins with IP
7. **Add security event alerting** - Integrate alerts for critical events
8. **Add backend file type validation** - Verify uploaded file content matches declared type
9. **Generate SBOM on release** - Add CycloneDX SBOM generation
10. **Increase HSTS max-age** - Change to 1 year (31536000) in [render.yaml](render.yaml)

### 📋 Medium Priority

11. Fix empty catch blocks with proper error handling
12. Add database transactions for multi-step operations
13. Implement session refresh mechanism
14. Add MFA backup codes
15. Pin GitHub Actions to SHA
16. Add rate limiting to bulk operations
17. Standardize permission checks to use centralized system
18. Add graceful shutdown handlers (SIGTERM/SIGINT)

---

## Files Reviewed

| Area | Key Files |
|------|-----------|
| Permission System | `backend/src/permissions/*` |
| Guards | `backend/src/middlewares/guard/*` |
| Authentication | `backend/src/modules/auth/*` |
| Session Management | `backend/src/modules/auth/session.ts`, `helpers/cookies.ts` |
| Password Handling | `backend/src/lib/password.ts` |
| Rate Limiting | `backend/src/lib/rate-limiter.ts` |
| Error Handling | `backend/src/middlewares/error-handler.ts`, `lib/errors.ts` |
| Logging | `backend/src/pino.ts`, `table-config.ts` |
| Configuration | `config/*.ts`, `backend/.env.example` |
| Security Headers | `render.yaml`, `backend/src/server.ts` |
| Database | `backend/src/db/*` |
| CI/CD | `.github/workflows/*.yml` |
| Frontend Security | `frontend/src/query/query-client.ts`, error boundaries |

---

## References

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
