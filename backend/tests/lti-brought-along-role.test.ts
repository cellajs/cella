import { createEntityHierarchy, createRoleRegistry } from 'shared';
import { config } from 'shared/config/config.default';
import { configModes } from 'shared/config-builder/app-config';
import type { DeepPartial } from 'shared/config-builder/types';
import { configurePolicyMatrix } from 'shared/testing/policies';
import { describe, expect, it } from 'vitest';
import { assertBroughtAlongRolesOpenNothing } from '#/modules/auth/flows/lti/operations/admit-lti-person';
import { adminRole, memberRole } from './fixtures';

// A course below the organization whose roles both bring along the organization's least role.
const roles = createRoleRegistry([adminRole, memberRole, 'teacher', 'student'] as const);
const nested = createEntityHierarchy(roles)
  .user()
  .organization({ roles: [adminRole, memberRole] })
  .channel('course', { parent: 'organization', roles: ['teacher', 'student'], organizationRoles: { teacher: memberRole, student: memberRole } })
  .build();

const policies = (read: 0 | 1) =>
  configurePolicyMatrix(
    ['user'],
    ({ entityType, channels }) => {
      if (entityType === 'user') channels.organization[memberRole]({ read });
    },
    { hierarchy: nested },
  );

// An app may declare its sign-in methods as a tuple that cannot name `lti`.
const namesLti = (strategies: readonly unknown[]) => strategies.includes('lti');
// A mode's list replaces the default's. A test file that turns `lti` on for itself changes none of them.
const ltiInSomeMode = Object.values<DeepPartial<typeof config>>(configModes).some((mode) =>
  namesLti(mode.enabledAuthStrategies ?? config.enabledAuthStrategies),
);

describe('the organization role a channel membership brings along', () => {
  it('refuses one that reads people, naming its cell, and passes one that opens nothing', () => {
    expect(() => assertBroughtAlongRolesOpenNothing(nested, policies(1))).toThrow(
      `channel "course" maps role "teacher" to organization role "${memberRole}", which grants user.read = 1 at the organization`,
    );
    expect(() => assertBroughtAlongRolesOpenNothing(nested, policies(0))).not.toThrow();
  });

  it.runIf(ltiInSomeMode)("passes the app's own map, which a mode boots with lti on", () => {
    expect(() => assertBroughtAlongRolesOpenNothing()).not.toThrow();
  });
});
