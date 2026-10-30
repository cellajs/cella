import { eq, inArray } from 'drizzle-orm';
import { createAttachments, deleteAttachments, updateAttachment } from 'sdk';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { maxClockSkewMs, parseHLC } from '#/core/stx/hlc';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { mockStxFor } from '#/schemas/sync-transaction-mocks';
import { adminRole, defaultHeaders } from '../fixtures';
import { adminDb } from '../helpers';
import { attachmentBody, cleanupEntityHierarchy, seedAttachmentHome } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** Within the 16 millis digits the stamp shape takes, and far past any wall clock. */
const farFutureStamp = '9999999999999999:0000:abcde';

/**
 * The server merges field edits by HLC stamps from one clock per process, which client stamps advance, and the stored
 * `stx` tells the CDC worker and the writer's tab who made a row's last write. A stamp from any tenant must not order
 * every later write, and a delete must not pass as the previous writer's edit.
 */
describe('Write integrity', async () => {
  const call = await createAppClient();
  let victim: TestTenant;
  let attacker: TestTenant;
  let deleter: { id: string; sessionCookie: string };
  const plans: TestEntityHierarchyPlan[] = [];
  const created: string[] = [];

  const orgOf = (tenant: TestTenant) => ({ id: tenant.organization.id, tenantId: tenant.tenantId });
  const headers = (cookie: string) => ({ ...defaultHeaders, Cookie: cookie });

  const createIn = async (tenant: TestTenant, plan: TestEntityHierarchyPlan, fields: Record<string, unknown> = {}) => {
    const id = generateId();
    created.push(id);
    const { response } = await call(createAttachments, {
      path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
      body: [attachmentBody(id, plan, fields)],
      headers: headers(tenant.sessionCookie),
    });
    return { id, status: response.status };
  };

  const rename = async (id: string, name: string, stx: ReturnType<typeof mockStxFor> & { replayed?: boolean }) => {
    const { response } = await call(updateAttachment, {
      path: { tenantId: victim.tenantId, organizationId: victim.organization.id, id },
      body: { ops: { name }, stx },
      headers: headers(victim.sessionCookie),
    });
    return response.status;
  };

  const remove = async (body: { ids: string[]; stx?: { mutationId: string; sourceId: string } }) => {
    const { response } = await call(deleteAttachments, {
      path: { tenantId: victim.tenantId, organizationId: victim.organization.id },
      body,
      headers: headers(deleter.sessionCookie),
    });
    return response.status;
  };

  /** A paused offline rename replayed now: its stamp is the device's wall clock, its intent time. */
  const replayedStx = () => ({ ...mockStxFor(), fieldTimestamps: { name: `${Date.now() + 1}:0000:zzzzz` }, replayed: true });

  const storedRow = async (id: string) => (await adminDb.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)))[0];

  const nameStampMillis = async (id: string) => parseHLC((await storedRow(id)).stx.fieldTimestamps.name)?.timestamp;

  beforeAll(async () => {
    victim = await createTestTenant(call, 'write-integrity-victim');
    attacker = await createTestTenant(call, 'write-integrity-attacker');
    deleter = await createOrgUser(call, victim.tenantId, victim.organization.id, 'write-integrity-deleter', adminRole);
    for (const tenant of [victim, attacker]) plans.push(await seedAttachmentHome(orgOf(tenant), tenant.user.id));
  });

  afterAll(async () => {
    await adminDb.delete(attachmentsTable).where(inArray(attachmentsTable.id, created));
    await cleanupEntityHierarchy(adminDb, ...plans);
    await clearSecurityTestData();
  });

  it("must not let one request's stamp move the server clock past the skew bound", async () => {
    const [victimPlan, attackerPlan] = plans;
    const { id } = await createIn(victim, victimPlan);

    // Accepted, not refused: a device whose clock runs fast still creates, and its stamp moves nothing.
    const poison = await createIn(attacker, attackerPlan, {
      stx: { mutationId: generateId(), sourceId: 'attacker', fieldTimestamps: { name: farFutureStamp } },
    });
    expect(poison.status).toBe(201);

    expect(await rename(id, 'Online', mockStxFor('name'))).toBe(200);
    expect(await nameStampMillis(id)).toBeLessThanOrEqual(BigInt(Date.now() + maxClockSkewMs));

    // The victim's offline edit, made after the online one, wins.
    expect(await rename(id, 'Replayed', replayedStx())).toBe(200);
    expect((await storedRow(id)).name).toBe('Replayed');
  });

  it('must not let a far-future stamp a row holds keep its field or move the server clock', async () => {
    const [victimPlan] = plans;
    const replayedOver = await createIn(victim, victimPlan);
    const renamedOver = await createIn(victim, victimPlan);
    for (const { id } of [replayedOver, renamedOver]) {
      const { stx } = await storedRow(id);
      await adminDb
        .update(attachmentsTable)
        .set({ stx: { ...stx, fieldTimestamps: { name: farFutureStamp } } })
        .where(eq(attachmentsTable.id, id));
    }

    expect(await rename(replayedOver.id, 'Replayed', replayedStx())).toBe(200);
    expect((await storedRow(replayedOver.id)).name).toBe('Replayed');

    expect(await rename(renamedOver.id, 'Online', mockStxFor('name'))).toBe(200);
    expect(await nameStampMillis(renamedOver.id)).toBeLessThanOrEqual(BigInt(Date.now() + maxClockSkewMs));
  });

  it('must record a delete with its own stx and no changed fields', async () => {
    const [victimPlan] = plans;
    const withStx = await createIn(victim, victimPlan);
    const withoutStx = await createIn(victim, victimPlan);
    for (const { id } of [withStx, withoutStx]) expect(await rename(id, 'Renamed', { ...mockStxFor('name'), sourceId: 'tab-owner' })).toBe(200);
    const { fieldTimestamps } = (await storedRow(withStx.id)).stx;

    // Another member deletes from their tab; the owner's tab must not take the delete for its own echo.
    const stx = { mutationId: generateId(), sourceId: 'tab-deleter' };
    expect(await remove({ ids: [withStx.id], stx })).toBe(200);
    expect(await remove({ ids: [withoutStx.id] })).toBe(200);

    expect((await storedRow(withStx.id)).stx).toEqual({ ...stx, fieldTimestamps });
    // A client that sends no stx (an API key) gets a server one, which no tab takes for its own.
    const { stx: serverStx } = await storedRow(withoutStx.id);
    expect(serverStx).toMatchObject({ sourceId: 'server' });
    expect(serverStx).not.toHaveProperty('changedFields');
  });
});
