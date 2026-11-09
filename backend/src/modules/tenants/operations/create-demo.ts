import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid, nanoidTenant } from 'shared/utils/nanoid';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { tenantContextById } from '#/db/tenant-context';
import { type DemoCreatedHook, onBackendModuleRegister } from '#/lib/module';
import { withActorRef } from '#/modules/actors/actor-refs';
import { setUserSession } from '#/modules/auth/sessions/operations/create-session';
import { findSession } from '#/modules/auth/sessions/operations/resolve-session';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { insertOrganizations } from '#/modules/organization/organization-queries';
import { kindRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { countTenantsCreatedSince, findDemoTenant, findTenant, insertTenant, lockDemoCreation } from '#/modules/tenants/tenants-queries';
import { insertUsers } from '#/modules/user/user-queries';
import { isoDateAgo, isoDateIn } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';
import { defaultWelcomeText } from '#json/text-blocks.json';

const dbCtx = { var: { db: baseDb } };

const demoHooks: DemoCreatedHook[] = [];

onBackendModuleRegister(({ onDemoCreated }) => {
  if (onDemoCreated) demoHooks.push(onDemoCreated);
});

/**
 * Builds a demo in one tenant transaction, as the demo's tenant: the account under a placeholder address with no
 * proven inbox, its tenant of kind `demo` with the kind's restrictions and its expiry, the organization the account
 * administers, then every module's `onDemoCreated` hook. A throw anywhere rolls the whole demo back. Builds wait for
 * each other, so a burst at the day's cap (`appConfig.demo.perDay`) counts one at a time.
 * @throws AppError 503 `demo_unavailable` once the day's demos are taken.
 */
async function buildDemo() {
  const tenantId = nanoidTenant();
  const userId = generateId();
  const handle = nanoid(10);
  const name = `${appConfig.name} demo`;

  return tenantContextById(tenantId, async (tx) => {
    const txCtx = { var: { db: tx } };
    await lockDemoCreation(txCtx);
    const takenToday = await countTenantsCreatedSince(txCtx, { kind: 'demo', since: isoDateAgo(new TimeSpan(1, 'd')) });
    if (takenToday >= appConfig.demo.perDay) throw new AppError(503, 'demo_unavailable', 'warn', { meta: { reason: 'daily_cap' } });

    const [user] = await insertUsers(txCtx, {
      users: [
        {
          id: userId,
          name: 'Guest',
          slug: `demo-${handle}`,
          email: `${userId}@${appConfig.demo.addressDomain}`,
          userFlags: { finishedOnboarding: true },
        },
      ],
    });
    const tenant = await insertTenant(txCtx, {
      values: {
        id: tenantId,
        name,
        kind: 'demo',
        createdBy: userId,
        expiresAt: isoDateIn(new TimeSpan(appConfig.retention.demoTenantDays, 'd')),
        restrictions: kindRestrictions('demo'),
      },
    });
    const [organization] = await insertOrganizations(txCtx, {
      orgs: [{ name, shortName: 'Demo', slug: `demo-${handle}`, tenantId, welcomeText: defaultWelcomeText, createdBy: userId }],
    });
    const role = hierarchy.getMostPrivilegedRole('organization');
    await insertMemberships(txCtx, { items: [{ userId, createdBy: userId, role, entity: organization }] });

    for (const hook of demoHooks) await hook(txCtx, { user, tenant, organization });
    return { user, tenant, organization };
  });
}

/**
 * Gives this browser a demo and signs it in to the demo's account: the demo its session holds while it runs, else one
 * built now, within the day's cap (`appConfig.demo.perDay`). The session it mints is a `demo` session, which signs in
 * nothing else, stands stepped up for nothing and ends with the tenant.
 * @returns The demo's tenant, with its organization, and whether this request built it.
 * @throws AppError 409 `demo_signed_in` while an account that is no demo is signed in here; 503 `demo_unavailable` once
 * the day's demos are taken.
 */
export async function createDemoOp(ctx: Context<Env>) {
  const presented = await findSession(ctx);
  if (presented) {
    if (presented.session.authStrategy !== 'demo') throw new AppError(409, 'demo_signed_in', 'info');
    const own = await findDemoTenant(dbCtx, { userId: presented.user.id });
    if (own) return { tenant: await withActorRef(dbCtx, own), created: false };
    // The demo this session held is over: a new one replaces it, session and all
  }

  const { user, tenant } = await buildDemo();
  await setUserSession(ctx, user, 'demo', 'regular', { expiresAt: tenant.expiresAt ?? undefined });
  log.info('Demo created', { tenantId: tenant.id });

  const created = await findTenant(dbCtx, { where: eq(tenantsTable.id, tenant.id) });
  if (!created) throw new AppError(500, 'server_error', 'error', { meta: { reason: 'created_tenant_not_found', tenantId: tenant.id } });
  return { tenant: await withActorRef(dbCtx, created), created: true };
}
