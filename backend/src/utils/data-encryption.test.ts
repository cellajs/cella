import { describe, expect, it } from 'vitest';
import { decryptData, encryptData, isEncryptedData } from './data-encryption';

const PURPOSE = 'test:data-encryption:v1';

describe('data encryption', () => {
  it('round trips plaintext through a versioned ciphertext envelope', () => {
    const encrypted = encryptData('JBSWY3DPEHPK3PXP', PURPOSE);

    expect(encrypted).toMatch(/^v1:/);
    expect(isEncryptedData(encrypted)).toBe(true);
    expect(decryptData(encrypted, PURPOSE)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a random IV for each encryption', () => {
    const first = encryptData('same plaintext', PURPOSE);
    const second = encryptData('same plaintext', PURPOSE);

    expect(first).not.toBe(second);
    expect(decryptData(first, PURPOSE)).toBe('same plaintext');
    expect(decryptData(second, PURPOSE)).toBe('same plaintext');
  });

  it('fails when the ciphertext is tampered with', () => {
    const encrypted = encryptData('sensitive', PURPOSE);
    const parts = encrypted.split(':');
    parts[2] = Buffer.from('tampered', 'utf8').toString('base64url');

    expect(() => decryptData(parts.join(':'), PURPOSE)).toThrow();
  });

  it('keeps purposes cryptographically separated', () => {
    const encrypted = encryptData('sensitive', PURPOSE);

    expect(() => decryptData(encrypted, 'test:other-purpose:v1')).toThrow();
  });
});
