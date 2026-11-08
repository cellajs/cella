import { describe, expect, it } from 'vitest';
import { ACCESS_KEY_EXAMPLE, accessKeyFault, accessKeyProgress, secretKeyFault } from './key-pair';

describe('accessKeyFault', () => {
  it.each([
    ['', 'Paste the access key.'],
    ['scw10x9pssz7b106dzny', 'An access key starts with SCW, as SCW10X9PSSZ7B106DZNY does.'],
    ['SCW10X9', 'An access key has 20 characters, this one 7.'],
    ['SCW10X9PSSZ7B106DZNYZ', 'An access key has 20 characters, this one 21.'],
    ['SCW10X9PSSZ7B106DZN-', 'An access key holds capitals and digits only.'],
    [ACCESS_KEY_EXAMPLE, undefined],
    ['SCWMTJXYNE7MNRCAN49T', undefined],
  ])('%s → %s', (value, fault) => {
    expect(accessKeyFault(value)).toBe(fault);
  });
});

describe('accessKeyProgress', () => {
  it('counts while the key is typed and ticks once it has the form of one', () => {
    expect(accessKeyProgress('')).toBe('');
    expect(accessKeyProgress('SCWQ2M3K7X')).toBe('10 of 20');
    expect(accessKeyProgress(ACCESS_KEY_EXAMPLE)).toBe('✔');
  });
});

describe('secretKeyFault', () => {
  it.each([
    ['', 'Paste the secret key.'],
    ['not-a-uuid', 'A secret key is a UUID of 36 characters (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), this value has 10.'],
    ['3f0c9d1e-5a2b-4c7d-9e8f-0a1b2c3d4e5f', undefined],
    ['3F0C9D1E-5A2B-4C7D-9E8F-0A1B2C3D4E5F', undefined],
  ])('%s → %s', (value, fault) => {
    expect(secretKeyFault(value)).toBe(fault);
  });
});
