import { type ChannelEntityType, hierarchy } from 'shared';
import { lisContextRoles, lisContextTypes } from '#/lib/lti-vocabulary';

/**
 * Whether a channel type is an LTI context, and of which LIS context types (`lisContextTypes`); null for a channel type
 * that is none. A launch names the resource link's own channel as its context when it is one, else its nearest ancestor
 * that is, else no context. The app fills this pinned file. The default: every channel is a context, a group.
 */
export const ltiContextTypes = (_channelType: ChannelEntityType): string[] | null => [lisContextTypes.group];

/**
 * The LTI roles a launch sends for the person's role in the context channel, as full URIs (`lisContextRoles`). The app
 * fills this pinned file. The default: a role the hierarchy marks as elevated sends Instructor, any other Learner.
 */
export const ltiRolesFor = (channelType: ChannelEntityType, role: string): string[] =>
  hierarchy.elevatedGrants.has(`${channelType}:${role}`) ? [lisContextRoles.instructor] : [lisContextRoles.learner];
