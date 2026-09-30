import { getRequests } from 'sdk';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { activityBus } from '#/lib/activity-bus';
import { createTenantForUser } from '#/modules/tenants/tenant-service';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createTestSession, createTestUser, mailsTo } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase } from '../test-utils';

afterEach(async () => {
  await clearDatabase();
});

const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const utcTime = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/;

/** The security mails handed to the mailer for the security inbox, with the recipient's language. */
const inboxMails = () =>
  mailsTo(appConfig.securityEmail).map(({ statics, recipient }) => ({ ...statics, lng: recipient.lng }));

describe('security inbox mails', async () => {
  const call = await createAppClient();

  it('reports a refused system admin route with an ISO time', async () => {
    const user = await createTestUser(signUpUser.email);
    const { response } = await call(getRequests, {
      headers: { ...defaultHeaders, Cookie: await createTestSession(user) },
    });

    expect(response.status).toBe(403);
    expect(inboxMails()).toEqual([
      {
        name: 'Security',
        type: 'sysadmin-fail',
        lng: appConfig.defaultLanguage,
        details: { ip: expect.any(String), route: '/requests', timestamp: expect.stringMatching(isoTime) },
      },
    ]);
  });

  it('reports a new tenant with a readable UTC time', async () => {
    const user = await createTestUser(signUpUser.email);
    await createTenantForUser(db, { name: 'Acme', createdBy: user.id, userEmail: user.email });

    expect(inboxMails()).toEqual([
      {
        name: 'Security',
        type: 'tenant-created',
        lng: appConfig.defaultLanguage,
        details: { tenantName: 'Acme', userEmail: user.email, timestamp: expect.stringMatching(utcTime) },
      },
    ]);
  });

  it('reports a system role change with a readable UTC time', async () => {
    await import('#/modules/system/system-listeners');
    const user = await createTestUser(signUpUser.email);

    activityBus.emit({
      id: generateId(),
      type: 'system_role.created',
      action: 'create',
      resourceType: 'system_role',
      entityType: null,
      rowData: { userId: user.id, role: 'admin' },
    } as never);

    await vi.waitFor(() =>
      expect(inboxMails()).toEqual([
        {
          name: 'Security',
          type: 'system-role-granted',
          lng: appConfig.defaultLanguage,
          details: { role: 'admin', userEmail: user.email, timestamp: expect.stringMatching(utcTime) },
        },
      ]),
    );
  });
});
