import { describe, expect, it } from 'vitest';
import { carriesSecretValues } from './scw-fetch';

describe('carriesSecretValues', () => {
  it('flags Secret Manager endpoints (bodies carry base64 secret values)', () => {
    expect(
      carriesSecretValues('https://api.scaleway.com/secret-manager/v1beta1/regions/fr-par/secrets/uuid/versions'),
    ).toBe(true);
    expect(
      carriesSecretValues(
        'https://api.scaleway.com/secret-manager/v1beta1/regions/fr-par/secrets/uuid/versions/latest/access',
      ),
    ).toBe(true);
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
