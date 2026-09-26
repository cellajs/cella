import { and, eq } from 'drizzle-orm';
import { hierarchy } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const [adminRole] = hierarchy.getRoles('organization');
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

type MemberRow = { id: string; membership: Record<string, unknown> };

/** Archive, mute and menu order are each member's own view of a channel, so a members list shows them for the caller's row only. */
describe("A member's personal view in the members list", async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  let organization: { id: string; tenantId: string };
  let viewer: { id: string; sessionCookie: string };
  let other: { id: string; sessionCookie: string };

  /** Raw JSON: the SDK's response parsing would hide a field the schema does not declare. */
  const listMembers = async (as: { sessionCookie: string }) => {
    const query = new URLSearchParams({ entityId: organization.id, entityType: 'organization' });
    const response = await baseApp.request(
      `/${organization.tenantId}/${organization.id}/memberships/members?${query}`,
      { headers: { ...defaultHeaders, Cookie: as.sessionCookie } },
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { items: MemberRow[] }).items;
  };

  beforeAll(async () => {
    mockFetchRequest();
    organization = await createTestOrganization();
    viewer = await createOrgUser(call, organization.tenantId, organization.id, 'personal-view-viewer', adminRole);
    other = await createOrgUser(call, organization.tenantId, organization.id, 'personal-view-other', memberRole);
    // The other member archived and muted the organization and moved it in their menu.
    await db
      .update(membershipsTable)
      .set({ archived: true, muted: true, displayOrder: 42 })
      .where(and(eq(membershipsTable.userId, other.id), eq(membershipsTable.channelId, organization.id)));
  });

  afterAll(async () => await clearSecurityTestData());

  it("must not show another member's archive, mute and order via getMembers", async () => {
    const items = await listMembers(viewer);
    const otherRow = items.find((item) => item.id === other.id);
    expect(otherRow?.membership).toBeDefined();
    for (const field of ['archived', 'muted', 'displayOrder']) expect(otherRow?.membership).not.toHaveProperty(field);
    // The rest of the membership stays: members see each other's role.
    expect(otherRow?.membership).toMatchObject({ userId: other.id, role: memberRole });
  });

  it("shows the caller's own archive, mute and order (positive control)", async () => {
    const own = (await listMembers(other)).find((item) => item.id === other.id);
    expect(own?.membership).toMatchObject({ archived: true, muted: true, displayOrder: 42 });
  });
});
