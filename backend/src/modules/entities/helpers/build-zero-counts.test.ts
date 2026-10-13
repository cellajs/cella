import { hierarchy, roles } from 'shared';
import { describe, expect, it } from 'vitest';
import { buildZeroCounts } from '#/modules/entities/helpers/build-zero-counts';

describe('buildZeroCounts', () => {
  it('counts the creator under the role they joined with, whatever that role is', () => {
    for (const role of hierarchy.getRoles('organization')) {
      const { membership } = buildZeroCounts('organization', role);

      expect(membership).toEqual({ ...Object.fromEntries(roles.all.map((name) => [name, name === role ? 1 : 0])), pending: 0, total: 1 });
    }
  });

  it('asks for the role', () => {
    // @ts-expect-error a channel whose creator joins under another role would report the default
    buildZeroCounts('organization');
  });
});
