import { appConfig } from 'shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { createSystemAdminUser, createTestSession } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

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
  params: { steps: Record<string, AssemblyStep> } | null;
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
      new Request(`http://localhost/me/upload-token?${new URLSearchParams(query)}`, {
        headers: { ...defaultHeaders, Cookie: cookie },
      }),
    );
    return { status: response.status, body: (await response.json()) as UploadTokenBody };
  };

  beforeAll(async () => {
    mockFetchRequest();
    // Tokens carry signed store params only when Transloadit is configured.
    vi.stubEnv('TRANSLOADIT_KEY', 'test-transloadit-key');
    vi.stubEnv('TRANSLOADIT_SECRET', 'test-transloadit-secret');
    tenant = await createTestTenant(call, 'upload-visibility');
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await clearSecurityTestData();
  });

  it('must not store a public file via choosing the public bucket for an attachment', async () => {
    const { status, body } = await requestToken({
      templateId: 'attachment',
      organizationId: tenant.organization.id,
      publicBucket: 'true',
    });

    expect(status).toBe(200);
    expect(body.publicBucket).toBe(false);
    expect(body.params?.steps.exported).toMatchObject({ acl: 'private', credentials: appConfig.s3.privateBucket });
  });

  it('stores avatars and covers public, whatever the client asks (positive control)', async () => {
    for (const templateId of ['avatar', 'cover']) {
      const { status, body } = await requestToken({ templateId, publicBucket: 'false' });

      expect(status, templateId).toBe(200);
      expect(body.publicBucket, templateId).toBe(true);
      expect(body.params?.steps.exported, templateId).toMatchObject({
        acl: 'public-read',
        credentials: appConfig.s3.publicBucket,
      });
    }
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
        expect(status).toBe(403);
        expect(body.type).toBe('no_sysadmin');
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
          expect(steps[step], step).toMatchObject({
            robot: '/image/resize',
            format: expect.stringMatching(/^(?:jpg|png|webp)$/),
          });
        }
      }
    });
  });
});
