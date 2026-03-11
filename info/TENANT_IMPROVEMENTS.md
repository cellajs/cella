# Tenant improvements

Plan for tenant table enhancements, subscription migration, domain verification, and auto-tenant creation during onboarding.

## Current state

- **Tenant table**: Minimal (`id`, `name`, `status`, `restrictions`). System-admin-only CRUD. No subscription or domain fields.
- **Organization.emailDomains**: Exists as `json string[]` but never queried, matched, or enforced. Safe to remove — no production use beyond defaults.
- **Paddle/subscription**: WIP stubs. Frontend has a "donate" checkout button on organization. Backend webhook logs `SubscriptionCreated` and does nothing else. No subscription fields in DB.
- **New user onboarding**: `SelectTenantFormField` derives tenants from memberships. New users have zero memberships → empty dropdown → **cannot create an org**.
- **AccountSecurity email**: Extensible template with `type` union + `details` map. Already used for sysadmin notifications (`sysadmin-fail`, `sysadmin-signin`). Sends to `appConfig.securityEmail`.

## Phase 1: Schema changes

### 1.1 Add fields to `tenantsTable`

| Field | Type | Notes |
|-------|------|-------|
| `createdBy` | `varchar FK → users` | Track who triggered creation (user or system admin) |
| `subscriptionId` | `varchar nullable` | Paddle subscription ID |
| `subscriptionStatus` | `enum` | Based on Paddle: `none`, `trialing`, `active`, `past_due`, `paused`, `canceled` |
| `subscriptionPlan` | `varchar nullable` | Plan slug (e.g. `free`, `pro`, `enterprise`) |
| `subscriptionData` | `json nullable` | Raw Paddle subscription payload for reference |

Add index on `subscriptionStatus` for filtering.

### 1.2 New `tenant_domains` table

Domains need cross-tenant uniqueness checks and reverse lookups (domain → tenant). This follows the same relational pattern as `emailsTable` (multiple emails per user) rather than a JSON blob.

**Why a dedicated table over JSON on tenant:**
- Postgres unique constraint enforces one-tenant-per-domain at DB level
- Index-backed `domain` lookups — no GIN/`@>` needed (codebase has no JSON array querying precedent)
- Follows existing `emailsTable` pattern: `id`, FK parent, `verified`, `verifiedAt`
- Extensible: add `lastCheckedAt`, `expiresAt` later without touching tenant schema

```typescript
export const tenantDomainsTable = pgTable('tenant_domains', {
  id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
  tenantId: varchar({ length: tenantIdLength }).notNull()
    .references(() => tenantsTable.id, { onDelete: 'cascade' }),
  domain: varchar({ length: maxLength.field }).notNull().unique(),  // globally unique
  verified: boolean().notNull().default(false),
  verificationToken: varchar({ length: maxLength.id }).$defaultFn(nanoid),
  verifiedAt: timestamp({ mode: 'string' }),
  lastCheckedAt: timestamp({ mode: 'string' }),
  createdAt: timestampColumns.createdAt,
}, (table) => [
  index('tenant_domains_tenant_id_idx').on(table.tenantId),
  index('tenant_domains_domain_idx').on(table.domain),
]);
```

**Domain verification — DNS TXT only.**

Researched methods used by major platforms:

| Method | Used by | Security | Proves | User difficulty |
|--------|---------|----------|--------|-----------------|
| **DNS TXT** | Google Workspace, GitHub, Microsoft 365, Vercel, Zitadel | Strong | Domain ownership (DNS admin access) | Medium |
| `.well-known` JSON | Let's Encrypt (ACME), Keybase | Moderate | Web hosting control, not ownership | Medium |
| DNS CNAME | Vercel (subdomain), some CDNs | Strong | DNS ownership | Medium |
| Admin email | Slack, AWS SES | Weak | Email access only | Easy |
| HTML meta tag | Google (legacy fallback) | Weak | Website edit access | Medium |

**Decision: DNS TXT only.** It's the industry standard, proves actual domain ownership, and is simple to implement server-side using Node.js built-in `dns.resolveTxt()` — zero extra dependencies.

**Verification flow:**
1. Tenant admin adds a domain → `verificationToken` is auto-generated (nanoid)
2. UI shows instruction: *"Add a DNS TXT record to verify ownership"*
   ```
   _cella-verification.acme.com  TXT  "<verificationToken>"
   ```
3. User clicks "Verify" → backend calls `dns.resolveTxt('_cella-verification.acme.com')`
4. If token found in TXT records → set `verified = true`, `verifiedAt = now()`
5. If not found → remain unverified, user can retry (DNS propagation can take time)

**Domain matching behavior:**
- Only **verified** domains are used for tenant matching during org creation
- Unverified domains can coexist across tenants (no conflict until verified)
- The unique constraint on `domain` means once any tenant claims a domain string, no other tenant can add it — even unverified. This prevents race conditions.

**Future considerations:**
- Periodic re-verification via cron (check `lastCheckedAt`, re-query DNS, revoke if TXT removed)
- Domain expiry / grace period before releasing claim
- For now: manual verification by system admin also supported (update `verified` directly)

### 1.3 Remove emailDomains from organization

- Remove `emailDomains` column from `organizationsTable` schema
- Remove from `organizationSchema` (API response)
- Remove from `organizationUpdateBodySchema` (API input)
- Remove frontend `DomainsFormField` usage from org settings
- No migration backfill needed — field has no production data beyond defaults

### 1.4 Subscription status enum

Based on `@paddle/paddle-node-sdk` types, Paddle uses:

```typescript
type PaddleSubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'paused' | 'trialing';
```

We add `none` for tenants without a subscription:

```typescript
const subscriptionStatusEnum = pgEnum('subscription_status', [
  'none',       // No subscription (default for new/free tenants)
  'trialing',   // Trial period
  'active',     // Paid and current
  'past_due',   // Payment overdue
  'paused',     // Paused by user or system
  'canceled',   // Canceled
]);
```

### 1.5 Move Paddle logic from organization to tenant

- Move `frontend/src/modules/organization/subscription.tsx` → `frontend/src/modules/tenants/subscription.tsx`
- Pass `tenantId` (not org ID) as Paddle checkout `customData` so webhooks can map subscription → tenant
- Update Paddle webhook handler to write `subscriptionId`, `subscriptionStatus`, `subscriptionPlan`, `subscriptionData` to `tenantsTable`
- Handle relevant Paddle events: `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.paused`, `subscription.resumed`, `subscription.past_due`

## Phase 2: Auto-create tenants during org creation

### 2.1 Tenant service utility

Extract tenant creation logic into a shared utility (`backend/src/modules/tenants/tenant-service.ts`) callable from both the system admin handler and the org creation handler.

```typescript
createTenantForUser(db, { name, createdBy }): Promise<TenantModel>
```

- Inserts tenant with `defaultRestrictions()`
- Sets `createdBy` to user ID
- Inserts a row in `tenant_domains` with domain extracted from user's email (unverified)
- **Sends AccountSecurity email** to system admin (see 2.2)
- Logs event: `logEvent('info', 'Tenant auto-created', { tenantId, userId })`

### 2.2 System admin notification via AccountSecurity

Add `tenant-created` to the `AccountSecurityType` union:

```typescript
type AccountSecurityType =
  | ... // existing types
  | 'tenant-created';
```

Add translation keys:

```json
"email.account_security.tenant-created.title": "New tenant created",
"email.account_security.tenant-created.text": "A new tenant <strong>{{tenantName}}</strong> was created on {{appName}} by {{userEmail}} at {{timestamp}}."
```

Usage in `createTenantForUser`:

```typescript
sendAccountSecurityEmail(
  { email: appConfig.securityEmail, name: 'Security' },
  'tenant-created',
  { tenantName: tenant.name, userEmail: user.email, timestamp: new Date().toISOString() }
);
```

This reuses the existing `sendAccountSecurityEmail` helper — minimal, fire-and-forget, with logging.

### 2.3 Org creation handler changes

Update `createOrganizations` in `organization-handlers.ts`:

**New flow when no `tenantId` is provided (or new route without tenant path param):**

1. Extract domain from `user.email` (e.g. `user@acme.com` → `acme.com`)
2. Query `tenant_domains` for a **verified** match:
   ```sql
   SELECT td.*, t.name as tenant_name FROM tenant_domains td
   JOIN tenants t ON t.id = td.tenant_id
   WHERE td.domain = 'acme.com' AND td.verified = true
   ```
3. **If match found**: Return info response `existing_tenant_found` with tenant name + id. Frontend shows a message suggesting the user request an invitation. User can override with `createNewTenant: true`.
4. **If no match or `createNewTenant: true`**: Call `createTenantForUser()`, then create org inside new tenant.

**API schema additions:**
- Optional `createNewTenant: boolean` on create-org body
- New response variant for `existing_tenant_found` info

### 2.4 Refactor system admin tenant handler

The existing `createTenant` handler in `tenants-handlers.ts` should delegate to the same `createTenantForUser` utility so all tenant creation flows are consistent.

## Phase 3: Frontend onboarding UX

### 3.1 Update CreateOrganizationForm

- When user has no memberships (new user), **hide `SelectTenantFormField` entirely**
- Submit without `tenantId` → triggers auto-create flow
- Handle `existing_tenant_found` response:
  - Show inline info banner: *"A workspace for your email domain (acme.com) already exists."*
  - Action: **"Create my own workspace"** → re-submit with `createNewTenant: true`
  - (Joining existing tenant is deferred to later iteration)
- When user already has memberships, show tenant selector as today (existing behavior preserved)

### 3.2 Onboarding stepper

- Org creation step works seamlessly for new users (no empty tenant dropdown)
- After successful org creation, auto-progress to invite step

## Phase 4: Domain verification UI (future)

### 4.1 Tenant domain management page

- List domains with verification status
- "Add domain" form with domain validation
- "Verify" button per unverified domain → calls backend verify endpoint
- Show DNS record instructions inline:
  ```
  Record type: TXT
  Host: _cella-verification
  Value: <verificationToken>
  ```
- Status indicators: unverified (warning), verified (green check), failed (red)

### 4.2 Backend verify endpoint

- `POST /tenants/{tenantId}/domains/{domainId}/verify`
- Uses Node.js `dns.resolveTxt()` to query `_cella-verification.<domain>`
- Matches `verificationToken` in TXT records
- Updates `verified`, `verifiedAt`, `lastCheckedAt`
- Returns success/failure with diagnostic info (records found, token expected)

## Identified UX gaps (for future iterations)

| Gap | Impact | Future mitigation |
|-----|--------|-------------------|
| **No "join existing tenant" flow** | Users whose company already has a tenant must be invited externally — no in-app discovery or request. | Add "Request to join" action that creates a pending request visible to tenant/org admins. Could reuse the existing `requests` module. |
| **Domain squatting** | Any user can claim a domain string (unique constraint). Until DNS-verified, claims are unverified but still block others. | Consider: allow duplicate unverified domains, only enforce uniqueness on verified. Or: time-limited claims (expire unverified after N days). |
| **Free vs. paid tenant defaults** | All tenants get identical `defaultRestrictions`. No plan-based differentiation. | Add tenant templates or plan-based restriction profiles. Paddle webhook updates restrictions on plan change. |
| **Multi-org tenants in UI** | Auto-create makes 1:1 tenant:org initially. Model supports 1:N but UI doesn't surface this well. | Ensure tenant selector reappears once user has multiple tenants. Allow creating additional orgs within existing tenant. |
| **Subscription UI** | No plan status visible to tenant admin. | Build tenant billing page showing current plan, usage, upgrade/cancel options. |
| **Periodic re-verification** | DNS TXT record could be removed after verification. No automatic detection. | Add cron job to re-check verified domains periodically. Revoke or warn if TXT removed. |

## Implementation order

1. **Phase 1.1 + 1.2 + 1.4** — Tenant schema: add fields, create `tenant_domains` table, subscription enum
2. **Phase 1.3** — Remove `emailDomains` from organization schema
3. **Phase 1.5** — Move Paddle logic from org to tenant
4. **Phase 2.2** — Add `tenant-created` to AccountSecurity email
5. **Phase 2.1** — Create `createTenantForUser()` utility
6. **Phase 2.3** — Update org creation handler for auto-tenant flow
7. **Phase 2.4** — Refactor admin tenant handler to use shared utility
8. **Phase 3.1** — Frontend: update create-org form
9. **Phase 3.2** — Frontend: fix onboarding stepper
10. **Phase 4** — Domain verification UI + backend verify endpoint (future iteration)

This order prioritizes unblocking new-user onboarding (the critical gap) and data model readiness before UI polish.

## Files to modify

### Backend
| File | Change |
|------|--------|
| `backend/src/db/schema/tenants.ts` | Add `createdBy`, subscription fields, subscription status enum |
| `backend/src/db/schema/tenant-domains.ts` | **New**: `tenant_domains` table with domain, verified, verificationToken |
| `backend/src/db/schema/organizations.ts` | Remove `emailDomains` column |
| `backend/src/modules/tenants/tenants-schema.ts` | Add new tenant fields + domain schemas to API validation |
| `backend/src/modules/tenants/tenants-handlers.ts` | Delegate to shared utility, add domain CRUD + verify endpoint |
| `backend/src/modules/tenants/tenants-routes.ts` | Add domain management + verify routes |
| `backend/src/modules/tenants/tenant-service.ts` | **New**: shared `createTenantForUser()` |
| `backend/src/modules/organization/organization-schema.ts` | Remove `emailDomains` from schemas |
| `backend/src/modules/organization/organization-handlers.ts` | Auto-tenant creation flow |
| `backend/src/modules/organization/organization-routes.ts` | Route adjustments for optional tenantId |
| `backend/src/modules/system/system-handlers.ts` | Update Paddle webhook to write to tenant |
| `backend/emails/templates/account-security.tsx` | Add `tenant-created` type |
| `backend/mocks/mock-organization.ts` | Remove `emailDomains` from mock |
| `locales/en/backend.json` | Add `tenant-created` translation keys |
| `locales/nl/backend.json` | Add `tenant-created` translation keys |

### Frontend
| File | Change |
|------|--------|
| `frontend/src/modules/organization/subscription.tsx` | Move to `tenants/subscription.tsx` |
| `frontend/src/modules/organization/create-organization-form.tsx` | Handle no-tenant flow, `existing_tenant_found` |
| `frontend/src/modules/home/onboarding/steps.tsx` | Fix stepper for new users |
| `frontend/src/modules/common/form-fields/domains.tsx` | Repurpose for tenant domain management (future) |

### Shared
| File | Change |
|------|--------|
| `shared/default-config.ts` | Potentially add subscription plan config |
