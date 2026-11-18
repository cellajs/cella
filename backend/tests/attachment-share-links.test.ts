import { eq } from 'drizzle-orm';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { channelTables } from '#/db/channel-tables';
import { homeChannelOf } from '#/db/utils/home-channel';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { defaultHeaders } from './fixtures';
import { adminDb, createTestOrganization, createTestUser } from './helpers';
import { insertAttachmentIn, seedAttachmentHome } from './hierarchy-helpers';
import { clearDatabase } from './test-utils';

afterEach(async () => await clearDatabase());

describe('attachment share links', async () => {
  const { baseApp } = await import('#/routes');
  const anonymous = (path: string) => baseApp.request(path, { headers: defaultHeaders });

  let organization: Awaited<ReturnType<typeof createTestOrganization>>;
  let userId: string;
  let plan: TestEntityHierarchyPlan;

  beforeEach(async () => {
    organization = await createTestOrganization();
    userId = (await createTestUser(`files-${generateId().slice(-8)}@cella.test`)).id;
    plan = await seedAttachmentHome(organization, userId);
  });

  const insertFile = async (columns: Record<string, unknown> = {}) => {
    const id = generateId();
    await insertAttachmentIn(plan, {
      id,
      tenantId: organization.tenantId,
      createdBy: userId,
      name: 'report.pdf',
      filename: 'report.pdf',
      contentType: 'application/pdf',
      size: 2048,
      public: false,
      ...columns,
    });
    return id;
  };

  const numberOf = async (id: string) =>
    (await adminDb.select({ number: attachmentsTable.number }).from(attachmentsTable).where(eq(attachmentsTable.id, id)))[0].number;

  // The code of the channel the plan homes attachments in: the organization in the template
  const homeCode = async () => {
    const { channelId, channelType } = homeChannelOf('attachment', { organizationId: organization.id, ...plan.channelIdColumns });
    const table = channelTables[channelType]();
    return (await adminDb.select({ code: table.code }).from(table).where(eq(table.id, channelId)))[0].code;
  };

  it('numbers files per home channel from 1, in insert order', async () => {
    const first = await insertFile();
    const second = await insertFile();

    expect([await numberOf(first), await numberOf(second)]).toEqual([1, 2]);
  });

  it('unfurls a private file with its name and a picture of its kind, sends a browser to the app and keeps it out of search', async () => {
    const id = await insertFile();

    const response = await anonymous(`/links/${await homeCode()}/a${await numberOf(id)}`);
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(page).toContain('<meta property="og:title" content="report.pdf" />');
    expect(page).toContain('<meta property="og:description" content="PDF · 2 KB · added ');
    expect(page).toContain('/static/link-previews/pdf.jpg" />');
    expect(page).toContain('<meta name="robots" content="noindex,nofollow" />');
    expect(page).toMatch(new RegExp(`/n\\?[^"]*productType=attachment&subjectId=${id}`));
  });

  it('answers a number no live file holds without an unfurl', async () => {
    const deleted = await insertFile({ deletedAt: new Date().toISOString() });
    const code = await homeCode();

    for (const path of [`/links/${code}/a${(await numberOf(deleted)) + 1}`, `/links/${code}/a${await numberOf(deleted)}`]) {
      const response = await anonymous(path);
      expect(response.status, path).not.toBe(200);
      expect(await response.text(), path).not.toContain('og:title');
    }
  });
});
