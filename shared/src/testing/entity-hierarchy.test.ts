import { describe, expect, it } from 'vitest';
import { channelsDownToStrictHome } from './entity-hierarchy';

describe('channelsDownToStrictHome', () => {
  const ancestors = ['project', 'courseSection', 'course', 'organization'];

  it('needs the deepest strict ancestor and the channels above it, and none below', () => {
    expect(channelsDownToStrictHome(ancestors, ['project', 'courseSection'])).toEqual(['course', 'organization']);
    expect(channelsDownToStrictHome(ancestors, [])).toEqual(ancestors);
  });

  it('needs the organization alone where every channel below it may be left unset', () => {
    expect(channelsDownToStrictHome(ancestors, ['project', 'courseSection', 'course'])).toEqual(['organization']);
    expect(channelsDownToStrictHome(['organization'], [])).toEqual(['organization']);
  });
});
