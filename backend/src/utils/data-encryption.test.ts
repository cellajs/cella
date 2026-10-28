import { describe, expect, it } from 'vitest';
import { decryptData, encryptData } from './data-encryption';

const purpose = 'test:data-encryption:v1';

describe('data encryption', () => {
  it('round trips plaintext through a versioned ciphertext envelope', () => {
    const encrypted = encryptData('JBSWY3DPEHPK3PXP', purpose);

    expect(encrypted).toMatch(/^v1:/);
    expect(decryptData(encrypted, purpose)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a random IV for each encryption', () => {
    const first = encryptData('same plaintext', purpose);
    const second = encryptData('same plaintext', purpose);

    expect(first).not.toBe(second);
    expect(decryptData(first, purpose)).toBe('same plaintext');
    expect(decryptData(second, purpose)).toBe('same plaintext');
  });

  it('fails when the ciphertext is tampered with', () => {
    const encrypted = encryptData('sensitive', purpose);
    const parts = encrypted.split(':');
    parts[2] = Buffer.from('tampered', 'utf8').toString('base64url');

    expect(() => decryptData(parts.join(':'), purpose)).toThrow();
  });

  it('keeps purposes cryptographically separated', () => {
    const encrypted = encryptData('sensitive', purpose);

    expect(() => decryptData(encrypted, 'test:other-purpose:v1')).toThrow();
  });
});
