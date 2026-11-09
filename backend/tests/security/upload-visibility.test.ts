import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { assumeMemberAttachmentPolicy } from 'shared/testing/member-policy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '#/env';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { defaultRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { defaultHeaders, overrideConfig } from '../fixtures';
import { adminDb, createSystemAdminUser, createTestSession, expectRefusal } from '../helpers';
import { insertAttachmentIn, seedAttachmentHome } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** A signed assembly step: `exported` stores the files (`acl`, `credentials`, `path`), the others process them. */
interface AssemblyStep {
  acl?: string;
  credentials?: string;
  path?: string;
  use?: string | string[];
  robot?: string;
  format?: string;
}

interface UploadTokenBody {
  publicBucket: boolean;
  sub: string;
  params: { auth: { max_number_of_files: number }; steps: Record<string, AssemblyStep> } | null;
  /** Error type, on a refusal. */
  type?: string;
}

/**
 * The upload token signs where Transloadit stores a file. A public-read object in the public bucket is served to anyone
 * from the app's storage, so its visibility must follow the upload template: an attachment may be any file type (HTML,
 * SVG) and stays private, whatever the client asks for.
 */
describe('Upload visibility', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  let tenant: TestTenant;

  /** Raw request: the client-chosen `publicBucket` is no longer part of the typed query. */
  const requestToken = async (query: Record<string, string>, cookie = tenant.sessionCookie) => {
    const response = await baseApp.fetch(
      new Request(`http://localhost/me/upload-token?${new URLSearchParams(query)}`, { headers: { ...defaultHeaders, Cookie: cookie } }),
    );
    return { status: response.status, body: (await response.json()) as UploadTokenBody };
  };

  beforeAll(async () => {
    // Tokens carry signed store params only when Transloadit is configured.
    overrideConfig(env, { TRANSLOADIT_KEY: 'test-transloadit-key', TRANSLOADIT_SECRET: 'test-transloadit-secret' });
    tenant = await createTestTenant(call, 'upload-visibility');
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  it('signs no more files than the tenant has attachments left, and none at its quota, before any file is stored', async () => {
    const capped = await createTestTenant(call, 'upload-quota');
    const restrictions = defaultRestrictions();
    restrictions.quotas.attachment = 2;
    await adminDb.update(tenantsTable).set({ restrictions }).where(eq(tenantsTable.id, capped.tenantId));
    invalidateCache.tenant(capped.tenantId);
    const organization = { id: capped.organization.id, tenantId: capped.tenantId };
    const plan = await seedAttachmentHome(organization, capped.user.id);
    const insertOne = () => insertAttachmentIn(plan, { id: generateId(), tenantId: capped.tenantId, createdBy: capped.user.id });
    const token = (templateId: string) => requestToken({ templateId, organizationId: organization.id }, capped.sessionCookie);

    await insertOne();
    const oneLeft = await token('attachment');
    expect(oneLeft.status).toBe(200);
    expect(oneLeft.body.params?.auth.max_number_of_files).toBe(1);

    await insertOne();
    const full = await token('attachment');
    expect(full.status).toBe(403);
    expect(full.body.type).toBe('restrict_by_app');

    // The quota binds attachments alone: an avatar still uploads.
    expect((await token('avatar')).status).toBe(200);
  });

  it('must not store a public file via choosing the public bucket for an attachment', async () => {
    const { status, body } = await requestToken({ templateId: 'attachment', organizationId: tenant.organization.id, publicBucket: 'true' });

    expect(status).toBe(200);
    expect(body.publicBucket).toBe(false);
    expect(body.params?.steps.exported).toMatchObject({ acl: 'private', credentials: appConfig.s3.privateBucket });
  });

  it('stores avatars and covers public, whatever the client asks (positive control)', async () => {
    for (const templateId of ['avatar', 'cover']) {
      const { status, body } = await requestToken({ templateId, publicBucket: 'false' });

      expect(status, templateId).toBe(200);
      expect(body.publicBucket, templateId).toBe(true);
      expect(body.params?.steps.exported, templateId).toMatchObject({ acl: 'public-read', credentials: appConfig.s3.publicBucket });
    }
  });

  describe('attachment uploads', () => {
    // A member role that reads attachments and creates none, as an app may configure it.
    assumeMemberAttachmentPolicy({ create: 0 });

    it('must not mint an attachment upload token without an organization the user may create in', async () => {
      // Without an organization the files would lie under the user's own prefix, which no row can name and no sweep removes.
      await expectRefusal(await requestToken({ templateId: 'attachment' }), 400, 'invalid_request');

      const member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'upload-visibility-member');
      const asMember = await requestToken({ templateId: 'attachment', organizationId: tenant.organization.id }, member.sessionCookie);
      await expectRefusal(asMember, 403, 'forbidden');

      // The organization's admin may create attachments there.
      const asAdmin = await requestToken({ templateId: 'attachment', organizationId: tenant.organization.id });
      expect(asAdmin.status).toBe(200);
      expect(asAdmin.body.sub).toBe(`${tenant.organization.id}/${tenant.user.id}`);
    });
  });

  describe('system uploads (newsletter images)', () => {
    /** With and without an organization id, which is no part of a system upload. */
    const systemQueries = (): Record<string, string>[] => [
      { templateId: 'newsletter' },
      { templateId: 'newsletter', organizationId: tenant.organization.id },
    ];

    it('must not get a system upload token via a session without the system role', async () => {
      // The tenant user administers an organization but holds no system role.
      for (const query of systemQueries()) {
        const { status, body } = await requestToken(query);
        await expectRefusal({ status, body }, 403, 'no_sysadmin');
      }
    });

    it('gives a system admin a public, re-encoded upload under the system prefix (positive control)', async () => {
      const admin = await createSystemAdminUser('upload-visibility-sysadmin@security-test.com');
      const cookie = await createTestSession(admin);

      // The prefix stays the system one, also when the request names an organization.
      for (const query of systemQueries()) {
        const { status, body } = await requestToken(query, cookie);
        expect(status).toBe(200);
        expect(body.publicBucket).toBe(true);
        expect(body.sub).toBe(`system/${admin.id}`);

        const steps = body.params?.steps ?? {};
        expect(steps.exported).toMatchObject({ acl: 'public-read', credentials: appConfig.s3.publicBucket });
        expect(steps.exported?.path?.startsWith(`/system/${admin.id}/`)).toBe(true);
        // Every stored file is an image the pipeline re-encoded, never the upload as sent.
        const stored = [steps.exported?.use ?? []].flat();
        expect(stored.length).toBeGreaterThan(0);
        for (const step of stored) {
          expect(steps[step], step).toMatchObject({ robot: '/image/resize', format: expect.stringMatching(/^(?:jpg|png|webp)$/) });
        }
      }
    });
  });
});
