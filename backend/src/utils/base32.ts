/** RFC 4648 base32 alphabet; authenticator apps read TOTP secrets in it. */
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encodes bytes as upper-case RFC 4648 base32, `=`-padded to a multiple of 8 characters unless `padding` is false. */
export function encodeBase32(bytes: Uint8Array, { padding = true } = {}): string {
  let encoded = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      encoded += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += alphabet[(buffer << (5 - bits)) & 31];
  return padding ? encoded.padEnd(Math.ceil(encoded.length / 8) * 8, '=') : encoded;
}

/** Decodes RFC 4648 base32 in either case, with or without `=` padding; throws on any other character. */
export function decodeBase32(encoded: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of encoded.replace(/=+$/, '').toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value === -1) throw new Error(`Invalid base32 character "${char}"`);
    buffer = ((buffer << 5) | value) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}
