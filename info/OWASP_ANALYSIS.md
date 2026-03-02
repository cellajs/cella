# OWASP Top 10:2025 Security Analysis

Analysis of the Cella codebase against the [OWASP Top 10:2025](https://owasp.org/Top10/2025/).

**Analysis date**: January 2026

## Executive summary

| Rank | Vulnerability | Status | Risk |
|------|---------------|--------|------|
| A01 | [Broken Access Control](#a01-broken-access-control) | ✅ Strong | Low |
| A02 | [Security Misconfiguration](#a02-security-misconfiguration) | ⚠️ Needs Attention | Medium |
| A03 | [Supply Chain Failures](#a03-supply-chain-failures) | ⚠️ Needs Attention | Medium-High |
| A04 | [Cryptographic Failures](#a04-cryptographic-failures) | ✅ Strong | Low |
| A06 | [Insecure Design](#a06-insecure-design) | ⚠️ Needs Attention | Medium |
| A07 | [Authentication Failures](#a07-authentication-failures) | ✅ Good | Low-Medium |
| A08 | [Data Integrity Failures](#a08-data-integrity-failures) | ✅ Good | Low |
| A09 | [Logging & Alerting Failures](#a09-logging--alerting-failures) | ✅ Good | Low-Medium |
| A10 | [Exceptional Conditions](#a10-exceptional-conditions) | ⚠️ Needs Attention | Medium |

---

## A01 Broken Access Control

**Status**: ✅ Strong — multi-layered access control with centralized permission manager, declarative route guards via OpenAPI, PostgreSQL Row-Level Security (RLS) on tenant-scoped tables, hashed session tokens with HttpOnly/Secure cookies, restricted CORS (single origin), CSRF middleware, comprehensive rate limiting, and IP-restricted system admin operations. RLS policies enforce tenant isolation at the database level via transaction-scoped `set_config` context (`app.tenant_id`, `app.user_id`, `app.is_authenticated`), applied to organizations, attachments, pages, memberships, and inactive memberships. All handler permission checks use the centralized `checkPermission()` system — no inline role string comparisons remain.

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| Presigned URL allows signing arbitrary keys | Medium | An authenticated org member can generate a presigned URL for any key in the private bucket, even without a matching attachment record. Restrict to keys with existing DB records. |
| Attachment redirect exposes metadata | Low | Public redirect handler leaks attachment filename, org name, and slug to unauthenticated users. Consider requiring auth or removing metadata from the response. |

---

## A02 Security Misconfiguration

**Status**: ⚠️ Needs Attention — good security headers (CSP, HSTS, X-Frame-Options), Zod-validated env config, secure cookies. Public frontend tokens (Google Maps, Sentry, Gleap) are not secrets — protection is at provider level.

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| Sourcemaps always enabled | Low | Disable for production or restrict access |

---

## A03 Supply Chain Failures

**Status**: ⚠️ Needs Attention — lockfile integrity enforced in CI, no external CDN scripts, minimal CI permissions, Knip for unused deps.

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| No vulnerability scanning | High | Add Dependabot or Snyk to CI |
| No SBOM generation | Medium | Add CycloneDX SBOM on release |
| Caret versioning throughout | Medium | Consider exact pinning for production deps |

---

## A04 Cryptographic Failures

**Status**: ✅ Strong — Argon2id with secret pepper, SHA-256 hashed session tokens, `crypto.getRandomValues` for token generation, TOTP via Web Crypto (160-bit secrets), 256-bit passkey challenges, signed cookies, log redaction of sensitive fields. No MD5/SHA1 used.

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| TOTP secrets unencrypted at rest | Low-Medium | Consider encrypting in DB |

---

## A06 Insecure Design

**Status**: ⚠️ Needs Attention — comprehensive auth rate limiting (including slow brute force detection), org creation limit (5/user), request body limits (1MB JSON, 20MB multipart), secure defaults, member as default role. Invitation endpoints rate-limited via `spamLimiter` (10 req/hr per IP). Organization member quota enforced before inserts, counting both active memberships and pending invitations.

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| No backend file type validation | Medium | Verify uploaded content matches declared type |
| No rate limiting on bulk operations | Medium | Add limiters to bulk endpoints |
| No storage quota enforcement | Low | Track and limit per-org storage |
| `userFlags` direct merge | Low | Restrict to expected flag keys |

---

### Other concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| No session refresh mechanism | Medium | Implement sliding sessions or refresh tokens |
| No MFA recovery (backup codes) | Medium | Implement backup codes |

---

## A08 Data Integrity Failures

**Status**: ✅ Good — signed cookies with versioning, Transloadit HMAC-SHA384 signing, frozen lockfile in CI, no external scripts, Zod-validated cookie payloads, CDN URL validation.

---

## A10 Exceptional Conditions

**Status**: ⚠️ Needs Attention — centralized `AppError` handler with Sentry integration (client responses exclude stack traces, internal IDs, PG details), fail-closed auth/authz guards, frontend error boundaries (root + app + public), optimistic update rollback on mutation failure.

### Open concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| Empty catch blocks (7 remaining) | Low | All intentional fallbacks: URL/JSON body parsing, cookie parsing, passive event detection, editor focus |

---

## Priority action items

### 🔴 Critical

1. Add dependency vulnerability scanning (Dependabot / Snyk)

### ⚠️ High

2. Add backend file type validation for uploads
3. Generate SBOM on release
4. Increase HSTS max-age to 1 year

### 📋 Medium

5. Add DB transactions for multi-step operations
6. Implement session refresh mechanism
7. Add MFA backup codes
8. Add rate limiting to bulk operations
9. Add graceful shutdown logic (close DB pools, drain connections)

---

## References

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
