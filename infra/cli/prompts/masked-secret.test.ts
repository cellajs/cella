import { describe, expect, it } from 'vitest';
import { maskSecret } from './masked-secret';

describe('maskSecret', () => {
  it('must not show any character of the value, at any length', () => {
    const secret = 'correct-horse-battery-staple';
    // Every prefix is rendered once while the value is typed: none of them may carry a character of it.
    for (let length = 1; length <= secret.length; length += 1) {
      const shown = maskSecret(secret.slice(0, length));
      expect(shown).toBe('•'.repeat(length));
      for (const character of new Set(secret)) expect(shown).not.toContain(character);
    }
  });

  it('returns an empty string for an empty value', () => {
    expect(maskSecret('')).toBe('');
  });
});
