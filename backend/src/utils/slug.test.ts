import { describe, expect, it } from 'vitest';
import { displayNameFromEmail } from '#/utils/slug';

/** Addresses as people type them, and the name a new account gets from each. */
const cases = [
  ['founder@example.com', 'Founder'],
  ['jonas.peeters@example.com', 'Jonas Peeters'],
  ['jonas.peeters+raak@example.com', 'Jonas Peeters'],
  ['anna_de-vries@example.com', 'Anna De Vries'],
  ['j..doe@example.com', 'J Doe'],
  ['+tag@example.com', '+tag'],
] as const;

describe('displayNameFromEmail', () => {
  it.each(cases)('names %s %j', (email, name) => {
    expect(displayNameFromEmail(email)).toBe(name);
  });
});
