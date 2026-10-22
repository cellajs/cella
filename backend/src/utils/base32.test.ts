import { describe, expect, it } from 'vitest';
import { decodeBase32, encodeBase32 } from '#/utils/base32';

/** The test vectors of RFC 4648 section 10. */
const vectors = [
  ['', ''],
  ['f', 'MY======'],
  ['fo', 'MZXQ===='],
  ['foo', 'MZXW6==='],
  ['foob', 'MZXW6YQ='],
  ['fooba', 'MZXW6YTB'],
  ['foobar', 'MZXW6YTBOI======'],
] as const;

const bytes = (text: string) => new TextEncoder().encode(text);

describe('base32', () => {
  it.each(vectors)('encodes %j as %s', (text, encoded) => {
    expect(encodeBase32(bytes(text))).toBe(encoded);
    expect(encodeBase32(bytes(text), { padding: false })).toBe(encoded.replace(/=+$/, ''));
  });

  it.each(vectors)('decodes %j from %s, padded or not, in either case', (text, encoded) => {
    expect(decodeBase32(encoded)).toEqual(bytes(text));
    expect(decodeBase32(encoded.replace(/=+$/, '').toLowerCase())).toEqual(bytes(text));
  });

  it('round-trips a 20-byte TOTP secret', () => {
    const secret = crypto.getRandomValues(new Uint8Array(20));
    const encoded = encodeBase32(secret);
    expect(encoded).toMatch(/^[A-Z2-7]{32}$/);
    expect(decodeBase32(encoded)).toEqual(secret);
  });

  it('rejects a character outside the alphabet', () => {
    expect(() => decodeBase32('MZXW1===')).toThrow('Invalid base32 character "1"');
  });
});
