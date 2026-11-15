import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { channelCodesTable } from '#/modules/links/links-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { defaultHeaders } from './fixtures';
import { adminDb, createTestOrganization } from './helpers';
import { clearDatabase } from './test-utils';

afterEach(async () => await clearDatabase());

describe('channel share links', async () => {
  const { baseApp } = await import('#/routes');
  const anonymous = (path: string) => baseApp.request(path, { headers: defaultHeaders });

  const codeOf = async (id: string) =>
    (await adminDb.select({ code: organizationsTable.code }).from(organizationsTable).where(eq(organizationsTable.id, id)))[0].code;

  it('gives a new channel a code from the registry, which no update changes', async () => {
    const organization = await createTestOrganization();
    const code = await codeOf(organization.id);

    expect(code).toMatch(/^[0-9][a-z0-9]{6}$/);
    expect((await adminDb.select().from(channelCodesTable).where(eq(channelCodesTable.code, code)))[0]).toMatchObject({
      channelType: 'organization',
      channelId: organization.id,
      tenantId: organization.tenantId,
    });
    await expect(adminDb.update(organizationsTable).set({ code: '0000000' }).where(eq(organizationsTable.id, organization.id))).rejects.toThrow();
  });

  it('ignores a code an insert brings', async () => {
    const first = await createTestOrganization();
    const second = await createTestOrganization({ code: await codeOf(first.id) });

    expect(await codeOf(second.id)).not.toBe(await codeOf(first.id));
  });

  it('sends a link no module previews, an unknown code and a malformed one on without an unfurl', async () => {
    const organization = await createTestOrganization();

    for (const path of [`/links/${await codeOf(organization.id)}`, '/links/0000000', '/links/0000000/t1', '/links/abc']) {
      const response = await anonymous(path);
      expect(response.status, path).not.toBe(200);
      expect(await response.text(), path).not.toContain('og:title');
    }
  });
});
