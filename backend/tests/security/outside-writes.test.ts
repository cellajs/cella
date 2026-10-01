import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getAttachments } from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { actorsTable } from '#/modules/actors/actors-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { defaultHeaders, memberRole } from '../fixtures';
import { createTestOrganization, createTestUser, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createOrgUser } from './helpers';

/**
 * Another process (the mcp or oauth worker, the other API generation during a deploy) or a write outside the API
 * changes access without telling this one. Sessions are read at every request and memberships are cached under the
 * bindings version a trigger replaces, so the change counts at this process's next request.
 */
describe('access written outside this process', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  const bindingsVersionOf = async (userId: string) =>
    (await db.select({ version: actorsTable.bindingsVersion }).from(actorsTable).where(eq(actorsTable.id, userId)))[0]?.version;

  /** A member whose first read caches their memberships in this process. */
  async function memberReading() {
    const org = await createTestOrganization();
    const member = await createOrgUser(call, org.tenantId, org.id, `member-${nanoid(8)}`, memberRole);
    const read = () =>
      call(getAttachments, {
        path: { tenantId: org.tenantId, organizationId: org.id },
        headers: { ...defaultHeaders, Cookie: member.sessionCookie },
      });
    expect((await read()).response.status).toBe(200);
    return { member, read };
  }

  it('gives the bindings version a new value at every membership insert, update and delete, cascades included', async () => {
    const user = await createTestUser(`versioned-${nanoid(8)}@security-test.com`);
    const org = await createTestOrganization();
    const versions = [await bindingsVersionOf(user.id)];

    await db.insert(membershipsTable).values({
      id: generateId(),
      userId: user.id,
      channelId: org.id,
      organizationId: org.id,
      tenantId: org.tenantId,
      channelType: 'organization',
      role: memberRole,
      displayOrder: 1,
      createdBy: user.id,
    });
    versions.push(await bindingsVersionOf(user.id));
    await db.update(membershipsTable).set({ muted: true }).where(eq(membershipsTable.userId, user.id));
    versions.push(await bindingsVersionOf(user.id));
    // Deleting the organization takes the membership by cascade.
    await db.delete(organizationsTable).where(eq(organizationsTable.id, org.id));
    versions.push(await bindingsVersionOf(user.id));

    expect(await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id))).toEqual([]);
    expect(new Set(versions).size).toBe(4);
  });

  it('must not keep a member reading via cached memberships once another process removed the membership', async () => {
    const { member, read } = await memberReading();

    await db.delete(membershipsTable).where(eq(membershipsTable.userId, member.id));

    // The tenant guard refuses first: the member holds no membership in the tenant any more.
    await expectRefusal(await read(), 403, 'forbidden');
  });

  it('must not keep a session reading once another process revoked it', async () => {
    const { member, read } = await memberReading();

    await db
      .update(sessionsTable)
      .set({ revokedAt: new Date().toISOString(), revocationReason: 'sign_out' })
      .where(eq(sessionsTable.userId, member.id));

    await expectRefusal(await read(), 401, 'session_revoked');
  });
});
