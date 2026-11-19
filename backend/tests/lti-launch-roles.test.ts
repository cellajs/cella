import { generateId } from 'shared/utils/entity-id';
import { describe, expect, it, vi } from 'vitest';
import { lisContextRoles, lisInstitutionRoles } from '#/lib/lti-vocabulary';
import { ltiLaunchRoles } from '#/modules/lti-platform/helpers/lti-roles';
import { adminRole, memberRole } from './fixtures';

// The template's answers in the files an app fills: an app's own answers leave these tests as they are.
vi.mock('#/modules/lti-platform/launch-context', async (importOriginal) =>
  (await import('./lti-template-answers')).templateLaunchContext(await importOriginal()),
);

const organizationId = generateId();
const link = { channelType: 'organization' as const, channelId: organizationId, organizationId };
const channel = { id: organizationId };
const membership = (role: typeof adminRole | typeof memberRole, inOrganization = organizationId) => ({
  channelType: 'organization' as const,
  channelId: inOrganization,
  organizationId: inOrganization,
  role,
});

// Contract: the roles an LTI tool reads from a launch. The template has no channel below the organization: a person
// without a membership whom a tab for its editors lets in, and power from elsewhere, are shown on the organization.
describe('ltiLaunchRoles', () => {
  it('sends the context role Administrator to a person without a membership, whom only a tab for its editors lets in', () => {
    expect(ltiLaunchRoles({ personId: generateId(), memberships: [], link, channel })).toEqual([
      lisContextRoles.administrator,
      lisInstitutionRoles.member,
    ]);
  });

  it("decides a member's roles from their membership in the channel alone, whatever they hold elsewhere", () => {
    const elsewhere = membership(adminRole, generateId());
    expect(ltiLaunchRoles({ personId: generateId(), memberships: [elsewhere, membership(memberRole)], link, channel })).toEqual([
      lisContextRoles.learner,
      lisInstitutionRoles.member,
    ]);
    expect(ltiLaunchRoles({ personId: generateId(), memberships: [membership(adminRole)], link, channel })).toEqual([
      lisContextRoles.instructor,
      lisInstitutionRoles.administrator,
    ]);
  });
});
