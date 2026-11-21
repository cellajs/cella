import { createEntityHierarchy, createRoleRegistry } from 'shared';
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

describe('the organization role a channel membership brings along', () => {
  it('refuses at load one that reads people, naming its cell, and passes one that opens nothing', () => {
    expect(() => assertBroughtAlongRolesOpenNothing(nested, policies(1))).toThrow(
      `channel "course" maps role "teacher" to organization role "${memberRole}", which grants user.read = 1 at the organization`,
    );
    expect(() => assertBroughtAlongRolesOpenNothing(nested, policies(0))).not.toThrow();
  });
});
