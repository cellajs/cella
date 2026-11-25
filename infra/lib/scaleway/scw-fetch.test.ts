import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { carriesSecretValues, retryAfterMs, scwErrorStatus, scwSend } from './scw-fetch';

describe('carriesSecretValues', () => {
  it('flags Secret Manager endpoints (bodies carry base64 secret values)', () => {
    expect(carriesSecretValues('https://api.scaleway.com/secret-manager/v1beta1/regions/fr-par/secrets/uuid/versions')).toBe(true);
    expect(carriesSecretValues('https://api.scaleway.com/secret-manager/v1beta1/regions/fr-par/secrets/uuid/versions/latest/access')).toBe(true);
  });

  it('flags IAM api-key endpoints (minting responses contain the secret key)', () => {
    expect(carriesSecretValues('https://api.scaleway.com/iam/v1alpha1/api-keys')).toBe(true);
    expect(carriesSecretValues('https://api.scaleway.com/iam/v1alpha1/api-keys/SCWXXX')).toBe(true);
  });

  it('leaves value-free endpoints loggable for debugging', () => {
    expect(carriesSecretValues('https://api.scaleway.com/iam/v1alpha1/applications?name=x')).toBe(false);
    expect(carriesSecretValues('https://api.scaleway.com/domain/v2beta1/dns-zones')).toBe(false);
    expect(carriesSecretValues('https://api.scaleway.com/instance/v1/zones/fr-par-1/servers')).toBe(false);
  });
});

describe('a Scaleway call that is answered with an error status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // A POST that met a 5xx may have made its resource: only a 429, which did no work, sends it again.
  it.each([
    ['GET', 503, 3],
    ['PATCH', 502, 3],
    ['DELETE', 504, 3],
    ['GET', 429, 3],
    ['POST', 429, 3],
    ['POST', 503, 1],
    ['GET', 500, 1],
    ['GET', 404, 1],
  ])('%s answered %i is sent %i times, and the error carries the status', async (method, status, sent) => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status, text: async () => 'a body that names 404 and 503' }));
    const failure = scwSend({ secretKey: 'k', fetchImpl }, method, 'https://api.scaleway.com/lb/v1/certificates/404').catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();
    expect(scwErrorStatus(await failure)).toBe(status);
    expect(fetchImpl).toHaveBeenCalledTimes(sent);
  });

  it('reads Retry-After as seconds or a date, held to half a minute', () => {
    expect(retryAfterMs('3')).toBe(3_000);
    expect(retryAfterMs('Wed, 21 Oct 2015 07:28:10 GMT', Date.parse('2015-10-21T07:28:00Z'))).toBe(10_000);
    expect(retryAfterMs('600')).toBe(30_000);
    expect(retryAfterMs('soon')).toBeUndefined();
  });
});
