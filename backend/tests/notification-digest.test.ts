import { eq } from 'drizzle-orm';
import { batchCreateAttachments } from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { notificationPreferencesTable, notificationsTable } from '#/modules/notification/notification-db';
import { runDigest } from '#/modules/notification/operations/run-digest';
import { adminRole, defaultHeaders } from './fixtures';
import { adminDb, failNextMailSend, mailsTo } from './helpers';
import { attachmentBody, seedAttachmentHome } from './hierarchy-helpers';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** Noon UTC on the next `isoWeekday` (1 = Monday … 7 = Sunday) after today: past the send hour. */
const nextNoonOn = (isoWeekday: number) => {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  do date.setUTCDate(date.getUTCDate() + 1);
  while ((date.getUTCDay() || 7) !== isoWeekday);
  return date;
};

// The weekly digest is the default cadence: an account that never opened its notification settings has no
// preferences row and still gets it.
describe('Weekly digest by default', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let member: { id: string; email: string };
  /** A member with nothing to digest: the run never walks it. */
  let idle: { id: string; email: string };
  const attachmentId = generateId();

  const preferencesOf = async (userId: string) =>
    (await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, userId)))[0];

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'digest-default');
    member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'digest-default-member', adminRole);
    idle = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'digest-default-idle', adminRole);

    const home = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);
    const { response } = await call(batchCreateAttachments, {
      path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
      body: [attachmentBody(attachmentId, home)],
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(response.status).toBe(201);
    await adminDb.update(attachmentsTable).set({ name: 'Weekly item' }).where(eq(attachmentsTable.id, attachmentId));

    // Undigested and never mailed instantly, an hour old.
    await db.insert(notificationsTable).values({
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      userId: member.id,
      actorId: tenant.user.id,
      type: 'comment',
      entityType: 'attachment',
      subjectId: attachmentId,
      contextId: attachmentId,
      channelId: tenant.organization.id,
      channelType: 'organization',
      organizationId: tenant.organization.id,
      tenantId: tenant.tenantId,
      activityId: `act:${generateId()}`,
    });
  });

  afterAll(async () => {
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, member.id));
    await clearSecurityTestData();
  });

  it('skips a user without a preferences row on a weekday that is not the weekly one', async () => {
    expect(await preferencesOf(member.id)).toBeUndefined();
    await runDigest(nextNoonOn(4));
    expect(mailsTo(member.email)).toEqual([]);
  });

  it('stamps no run when the digest mail fails, so the next tick sends it', async () => {
    failNextMailSend();
    await runDigest(nextNoonOn(5));

    expect(mailsTo(member.email)).toHaveLength(1);
    expect(await preferencesOf(member.id)).toBeUndefined();
  });

  it('mails the weekly digest to a user without a preferences row and stamps the run on a new row', async () => {
    expect(await preferencesOf(member.id)).toBeUndefined();
    const friday = nextNoonOn(5);
    await runDigest(friday);

    const [digest] = mailsTo(member.email);
    const sectionsHtml = digest && 'sectionsHtml' in digest.recipient ? String(digest.recipient.sectionsHtml) : '';
    expect(sectionsHtml).toContain('Weekly item');
    const preferences = await preferencesOf(member.id);
    expect(preferences?.digest).toBe('weekly');
    expect(preferences?.lastDigestAt).not.toBeNull();

    // A user with nothing undigested is not due, so the run neither mails nor stamps it.
    expect(mailsTo(idle.email)).toEqual([]);
    expect(await preferencesOf(idle.id)).toBeUndefined();
  });
});

// The window is Postgres's from end to end: it starts at the recipient's last run and ends at this run's start. A
// JavaScript read of zone-less text would shift it by the process's zone, so a run outside UTC (TZ=Europe/Amsterdam)
// catches one.
describe('Digest window', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let member: { id: string; email: string };
  const hour = 60 * 60 * 1000;
  const titles = { before: 'Before the last run', after: 'After the last run', during: 'During this run' };
  const subjectIds = { before: generateId(), after: generateId(), during: generateId() };

  /** Noon UTC yesterday: past the send hour, and behind the wall clock at any hour, so a run stamped by the clock fails. The last daily digest ran a day earlier. */
  const thisRun = new Date();
  thisRun.setUTCHours(12, 0, 0, 0);
  thisRun.setUTCDate(thisRun.getUTCDate() - 1);
  const lastRun = new Date(thisRun.getTime() - 24 * hour);

  const sectionsTo = (email: string) => mailsTo(email).map(({ recipient }) => ('sectionsHtml' in recipient ? String(recipient.sectionsHtml) : ''));

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'digest-window');
    member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'digest-window-member', adminRole);

    const home = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);
    const { response } = await call(batchCreateAttachments, {
      path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
      body: Object.values(subjectIds).map((id) => attachmentBody(id, home)),
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(response.status).toBe(201);

    const createdAt = { before: lastRun.getTime() - hour / 2, after: lastRun.getTime() + hour / 2, during: thisRun.getTime() + 60 * 1000 };
    for (const key of ['before', 'after', 'during'] as const) {
      await adminDb.update(attachmentsTable).set({ name: titles[key] }).where(eq(attachmentsTable.id, subjectIds[key]));
      await db.insert(notificationsTable).values({
        createdAt: new Date(createdAt[key]).toISOString(),
        userId: member.id,
        actorId: tenant.user.id,
        type: 'comment',
        entityType: 'attachment',
        subjectId: subjectIds[key],
        contextId: subjectIds[key],
        channelId: tenant.organization.id,
        channelType: 'organization',
        organizationId: tenant.organization.id,
        tenantId: tenant.tenantId,
        activityId: `act:${generateId()}`,
      });
    }
    await db.insert(notificationPreferencesTable).values({ userId: member.id, digest: 'daily', lastDigestAt: lastRun.toISOString() });
  });

  afterAll(async () => {
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, member.id));
    await clearSecurityTestData();
  });

  it('covers the rows since the last run up to the start of this one, and leaves a row written during the run to the next', async () => {
    await runDigest(thisRun);
    const [first] = sectionsTo(member.email);
    expect(first).toContain(titles.after);
    expect(first).not.toContain(titles.before);
    expect(first).not.toContain(titles.during);

    // The run settled the window at its start: the next day's digest carries the row written during it, and no other.
    await runDigest(new Date(thisRun.getTime() + 24 * hour));
    const [, second] = sectionsTo(member.email);
    expect(second).toContain(titles.during);
    expect(second).not.toContain(titles.after);
  });
});
