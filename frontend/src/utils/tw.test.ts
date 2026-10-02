import { describe, expect, it } from 'vitest';
import { tw } from './tw';

describe('tw', () => {
  it('returns the class string of a call or a tagged template unchanged', () => {
    const size = 4;
    expect(tw('flex p-2')).toBe('flex p-2');
    expect(tw`flex p-${size} data-[state=open]:block`).toBe('flex p-4 data-[state=open]:block');
  });
});
