import { describe, expect, it } from 'vitest';
import { redirectedApexOrigin } from './apex-origin.ts';

describe('redirectedApexOrigin', () => {
  it('is the bare domain only for a www host on that domain', () => {
    expect(redirectedApexOrigin('www.raak.dev', 'raak.dev')).toBe('https://raak.dev');
    expect(redirectedApexOrigin('staging.raak.dev', 'raak.dev')).toBeUndefined();
    // Development has no domain.
    expect(redirectedApexOrigin('localhost', '')).toBeUndefined();
  });
});
