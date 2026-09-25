import { appConfig } from 'shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** The part of a signed upload token that decides where Transloadit stores the files. */
interface StoreStep {
  acl: string;
  credentials: string;
}

interface UploadTokenBody {
  publicBucket: boolean;
  params: { steps: { exported: StoreStep } } | null;
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
  const requestToken = async (query: Record<string, string>) => {
    const response = await baseApp.fetch(
      new Request(`http://localhost/me/upload-token?${new URLSearchParams(query)}`, {
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
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
});
