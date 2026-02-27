# Tenant restrictions & API points rate limiting

Restrictions moved from `organizations` to `tenants` with a new `{ quotas, rateLimits }` structure. Points-weighted rate limiting added to all bulk endpoints.

**Created**: February 2026
**Status**: Implemented (phase 1)

---

## What changed

### Restrictions moved to tenants

Restrictions are now a JSON column on the `tenants` table instead of `organizations`. This is the correct boundary — tenants control isolation, not individual orgs.

```typescript
type Restrictions = {
  quotas: Record<EntityType, number>;  // hard entity caps, 0 = unlimited
  rateLimits: {
    apiPointsPerHour: number;          // per-user hourly budget within this tenant
  };
};
```

Default values (from `shared/default-config.ts`):

```
quotas:     { organization: 5, user: 1000, attachment: 100, page: 0 }
rateLimits: { apiPointsPerHour: 1000 }
```

The org creation limit (previously hardcoded to 5) is now configurable per tenant via `quotas.organization`.

### Tenant guard loads the tenant row

`tenantGuard` now queries the tenant by PK, checks its status, and sets `ctx.var.tenant` for downstream use. This also enables rejecting requests to suspended/archived tenants.

### Points-weighted rate limiting on bulk endpoints

A `pointsLimiter(cost)` factory creates middleware that consumes API points from a shared per-user hourly budget. The `bulkPointsLimiter` alias reads the request body length as the cost (1 point per item in the array).

Two ceilings apply:
- **Tenant budget** (default 1000/hr) — read from `tenant.restrictions.rateLimits.apiPointsPerHour`, tunable per tenant by system admins
- **Global safety net** (5000/hr) — hardcoded static cap, prevents misconfigured tenants from allowing abuse

The rate limit key is `tenantId:{id}userId:{id}` — identity only, no IP. Each user gets separate budgets per tenant.

### Protected routes (13 bulk endpoints)

| Route | File | Notes |
|-------|------|-------|
| `createOrganizations` | `organization-routes.ts` | |
| `deleteOrganizations` | `organization-routes.ts` | |
| `membershipInvite` | `memberships-routes.ts` | alongside `spamLimiter` |
| `deleteMemberships` | `memberships-routes.ts` | |
| `createAttachments` | `attachment-routes.ts` | |
| `deleteAttachments` | `attachment-routes.ts` | |
| `createPages` | `page-routes.ts` | |
| `deletePages` | `page-routes.ts` | |
| `deleteUsers` | `system-routes.ts` | |
| `systemInvite` | `system-routes.ts` | alongside `spamLimiter` |
| `deleteRequests` | `requests-routes.ts` | |
| `deleteMySessions` | `me-routes.ts` | |
| `markSeen` | `seen-routes.ts` | |

### Quota enforcement updated

Handler files now read quotas from `ctx.var.tenant.restrictions.quotas` instead of `organization.restrictions`:

- **Memberships**: `quotas.user` — max members per org
- **Attachments**: `quotas.attachment` — max attachments per org
- **Organizations**: `quotas.organization` — max orgs per user (was hardcoded 5)

### Tenant API

- `tenantSchema` response includes `restrictions`
- `updateTenantBodySchema` accepts partial restrictions (deep-merged on update so partial changes don't clobber existing values)

---

## Files changed

| File | Change |
|------|--------|
| `backend/src/db/utils/tenant-restrictions.ts` | New (renamed from `organization-restrictions.ts`) |
| `backend/src/db/schema/tenants.ts` | Added `restrictions` JSON column |
| `backend/src/db/schema/organizations.ts` | Removed `restrictions` column |
| `backend/src/lib/context.ts` | Added `tenant: TenantModel` to `Env.Variables` |
| `backend/src/middlewares/guard/tenant-guard.ts` | Loads tenant row, checks status, sets `ctx.var.tenant` |
| `backend/src/middlewares/rate-limiter/types.ts` | Added `tenantId` identifier, `getConsumePoints`, `getPointsBudget` |
| `backend/src/middlewares/rate-limiter/helpers.ts` | Added `tenantId` extraction, `bulkBodyLength` helper |
| `backend/src/middlewares/rate-limiter/core.ts` | Dynamic consume amount + per-tenant budget override |
| `backend/src/middlewares/rate-limiter/limiters.ts` | `pointsLimiter` factory + `bulkPointsLimiter` alias |
| `backend/src/modules/tenants/tenants-schema.ts` | Restrictions in response + partial update schema |
| `backend/src/modules/tenants/tenants-handlers.ts` | Deep-merge restrictions on update |
| `backend/src/modules/memberships/memberships-handlers.ts` | Reads `quotas.user` from tenant |
| `backend/src/modules/attachment/attachment-handlers.ts` | Reads `quotas.attachment` from tenant |
| `backend/src/modules/organization/organization-handlers.ts` | Uses `quotas.organization` (was hardcoded 5) |
| `backend/src/modules/organization/organization-schema.ts` | Removed `.omit({ restrictions: true })` |
| `backend/mocks/mock-organization.ts` | Removed restrictions import + field |
| 8 route files | Added `bulkPointsLimiter` to `xRateLimiter` |
| `shared/default-config.ts` | `defaultRestrictions` with nested structure |
| `shared/src/builder/types.ts` | Updated `RequiredConfig` |
| Drizzle migration | Add to tenants, drop from organizations |

---

## Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Restrictions on tenant vs org | Tenant | Boundary/isolation concern, not org-specific |
| Shared budget vs per-category | Single shared (weighted) | Industry standard (GitHub, Stripe, Supabase) |
| Key composition | `tenantId + userId` only | IP concatenation multiplies budgets per IP |
| `0 = unlimited` | Keep | Consistent with existing conventions |
| Global ceiling | 5000 | Safety net only, not the operating budget |
| blockDuration | 0 | Budget resets naturally after the 1-hour window |

---

## Recommended follow-ups

### Tests

- **Unit**: `bulkBodyLength` helper — various body shapes (`{ ids: [...] }`, top-level array, empty, non-JSON)
- **Unit**: `defaultRestrictions()` — validates structure against `appConfig.entityTypes`
- **Unit**: `pointsLimiter` budget resolution — tenant budget vs system default fallback
- **Integration**: bulk endpoint returns 429 after budget exhaustion
- **Integration**: tenant with custom `apiPointsPerHour` is respected
- **Integration**: tenant update with partial `restrictions` deep-merges correctly

### Data migration for existing deployments

The generated Drizzle migration adds `restrictions` to tenants with defaults and drops it from organizations. For existing deployments with custom per-org restrictions, a manual SQL step should copy the most permissive org restrictions to the parent tenant before dropping the column.

### Fix `presignedUrlLimiter` key composition

`presignedUrlLimiter` uses `['userId', 'ip']` which creates separate 2000/hr budgets per IP per user (same IP-concatenation issue). Should be changed to `['userId']` only.

### Single-write rate limiting (phase 2)

Add `pointsLimiter(1)` to all single-write endpoints (create, update, delete). The default budget of 1000/hr already accommodates this.

### Read rate limiting (phase 3)

Add `pointsLimiter(1)` to expensive read endpoints (search, export). Standard list/get endpoints remain free.

### Singleton limiter instance

Each call to `pointsLimiter(cost)` currently creates a new `RateLimiterDrizzle` instance. Since they all share the same `keyPrefix: 'apiPoints_limit'`, they work correctly against the same counter, but it would be cleaner to extract the instance to a module-level singleton.

### Frontend restrictions display

Surface tenant restrictions in the admin UI so system admins can view and adjust quotas and rate limits per tenant.

---

## References

- [rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible)
- Industry patterns: GitHub (5000/hr identity-keyed), Stripe (weighted points), Supabase (per-project budgets)
- [GitHub API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [Stripe API rate limits](https://docs.stripe.com/rate-limits)
- [Supabase rate limits](https://supabase.com/docs/guides/platform/going-into-prod#rate-limiting-resource-allocation--abuse-prevention)
