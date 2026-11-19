import { hierarchy } from 'shared';
import { isLisContextRole, isLisContextType, lisContextRoles, lisContextTypes } from '#/lib/lti-vocabulary';
import type * as LtiContextChannel from '#/modules/auth/flows/lti/lti-context-channel';
import type * as LaunchContext from '#/modules/lti-platform/launch-context';

/**
 * The template's own answers in the two files an app fills, which the LTI tests mock them with: an app that fills
 * them keeps these tests as they are. As an LTI tool, a LIS context or one of no type is the organization, any other
 * context none, and every person with a context role its least privileged member; as a platform, every channel is a
 * context and its readers are Learners, its editors Instructors.
 */
export const templateLtiContextChannel = (actual: typeof LtiContextChannel): typeof LtiContextChannel => ({
  ...actual,
  ltiContextChannelType: ({ types }) => (!types.length || types.some(isLisContextType) ? 'organization' : null),
  createLtiContextChannel: async (_ctx, { context }) => {
    throw new Error(`the template creates no channel for LTI context ${context.id}`);
  },
  ltiContextRole: ({ channelType, ltiRoles }) => (ltiRoles.some(isLisContextRole) ? hierarchy.getLeastPrivilegedRole(channelType) : null),
});

export const templateLaunchContext = (actual: typeof LaunchContext): typeof LaunchContext => ({
  ...actual,
  ltiContextTypes: () => [lisContextTypes.group],
  ltiRolesFor: (_channelType, can) => (can('update') ? [lisContextRoles.instructor] : can('read') ? [lisContextRoles.learner] : []),
});
