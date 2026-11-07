import { eq, inArray } from 'drizzle-orm';
import { listAttachments, listInvitations, listRequests, listUsers } from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, describe, expect, it } from 'vitest';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { requestsTable } from '#/modules/requests/requests-db';
import { adminRole, defaultHeaders } from './fixtures';
import { adminDb, createOrganizationAdminUser, createSystemAdminUser, createTestOrganization, createTestSession, createTestUser } from './helpers';
import { cleanupEntityHierarchy, insertAttachmentIn, seedAttachmentHome } from './hierarchy-helpers';
import { createInvitation } from './invitations/helpers';
import { clearSecurityTestData, createTestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type Page = { results: unknown[]; totalSize: number };

/** A list's `totalSize` counts every row, past the page: tables show it as the list's count. */
describe('List pages', async () => {
  const call = await createAppClient();

  afterAll(async () => await clearSecurityTestData());

  it('counts every user, whatever the page size and skip', async () => {
    await clearSecurityTestData();
    const admin = await createSystemAdminUser('total-admin@example.com');
    await createTestUser('total-one@example.com');
    await createTestUser('total-two@example.com');
    const headers = { ...defaultHeaders, Cookie: await createTestSession(admin) };

    for (const query of [
      { maxPageSize: 1, skip: 0 },
      { maxPageSize: 1, skip: 2 },
    ]) {
      const { data } = await call(listUsers, { query, headers });
      expect(data as Page).toMatchObject({ results: [expect.anything()], totalSize: 3 });
    }
  });

  it('counts every pending invitation, whatever the page size and skip', async () => {
    await clearSecurityTestData();
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser('total-org-admin@example.com', organization.id, adminRole, organization.tenantId);
    for (const email of ['total-a@example.com', 'total-b@example.com', 'total-c@example.com']) {
      await createInvitation({ organization, email, createdBy: admin.id });
    }
    const headers = { ...defaultHeaders, Cookie: await createTestSession(admin) };
    const path = { tenantId: organization.tenantId, organizationId: organization.id };

    for (const page of [
      { maxPageSize: 1, skip: 0 },
      { maxPageSize: 1, skip: 2 },
    ]) {
      const query = { entityId: organization.id, entityType: 'organization' as const, ...page };
      const { data } = await call(listInvitations, { path, query, headers });
      expect(data as Page).toMatchObject({ results: [expect.anything()], totalSize: 3 });
    }
  });

  // A paged table removed rows of a page it had read: the next page started that many rows late, so rows went missing until a refetch.
  it('starts the next page after the last row of the previous one when rows before it left the list', async () => {
    await clearSecurityTestData();
    const admin = await createSystemAdminUser('pages-admin@example.com');
    const headers = { ...defaultHeaders, Cookie: await createTestSession(admin) };
    const emails = ['a', 'b', 'c', 'd', 'e', 'f'].map((letter) => `paged-${letter}@example.com`);
    await adminDb.insert(requestsTable).values(emails.map((email) => ({ email, type: 'waitlist' as const })));

    const read = async (pageToken?: string) => {
      const query = { q: 'paged', orderBy: 'email asc' as const, maxPageSize: 2, ...(pageToken && { pageToken }) };
      const { data } = await call(listRequests, { query, headers });
      const page = data as { results: { email: string }[]; nextPageToken?: string };
      return { emails: page.results.map(({ email }) => email), nextPageToken: page.nextPageToken };
    };

    const first = await read();
    const second = await read(first.nextPageToken);
    expect([...first.emails, ...second.emails]).toEqual(emails.slice(0, 4));

    await adminDb.delete(requestsTable).where(inArray(requestsTable.email, emails.slice(0, 2)));
    expect(await read(second.nextPageToken)).toEqual({ emails: emails.slice(4), nextPageToken: undefined });
    await adminDb.delete(requestsTable).where(inArray(requestsTable.email, emails));
  });

  // A counter total above the real rows kept a paged list requesting the same offset in a loop until the rate limiter blocked the user.
  it('ends where the rows end, whatever the counter total claims', async () => {
    const tenant = await createTestTenant(call, 'list-pages-counter');
    const organization = tenant.organization;
    const plan = await seedAttachmentHome({ id: organization.id, tenantId: tenant.tenantId }, tenant.user.id);
    const ids = [generateId(), generateId(), generateId()];
    for (const id of ids) {
      await insertAttachmentIn(plan, { id, tenantId: tenant.tenantId, createdBy: tenant.user.id });
    }
    const counts = { 'e:c:attachment': 50 };
    await adminDb
      .insert(channelCountersTable)
      .values({ channelKey: organization.id, counts })
      .onConflictDoUpdate({ target: channelCountersTable.channelKey, set: { counts } });

    const pages: { results: { id: string }[]; nextPageToken?: string; totalSize: number }[] = [];
    let pageToken: string | undefined;
    do {
      const query = { maxPageSize: 2, ...(pageToken && { pageToken }) };
      const { data } = await call(listAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: organization.id },
        query,
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      const page = data as (typeof pages)[number];
      pages.push(page);
      pageToken = page.nextPageToken;
    } while (pageToken && pages.length < 5);

    expect(pages.map(({ results, totalSize }) => ({ rows: results.length, totalSize }))).toEqual([
      { rows: 2, totalSize: 50 },
      { rows: 1, totalSize: 50 },
    ]);
    expect(pages.flatMap(({ results }) => results.map(({ id }) => id)).sort()).toEqual([...ids].sort());

    await adminDb.delete(attachmentsTable).where(inArray(attachmentsTable.id, ids));
    await adminDb.delete(channelCountersTable).where(eq(channelCountersTable.channelKey, organization.id));
    await cleanupEntityHierarchy(adminDb, plan);
  });
});
