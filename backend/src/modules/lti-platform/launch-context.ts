import type { ChannelEntityType, EntityActionType } from 'shared';
import { lisContextRoles, lisContextTypes } from '#/lib/lti-vocabulary';

/**
 * Whether a channel type is an LTI context, and of which LIS context types (`lisContextTypes`); null for a channel type
 * that is none. A launch names the resource link's own channel as its context when it is one, else its nearest ancestor
 * that is, else no context. The app fills this pinned file. The default: every channel is a context, a group.
 */
export const ltiContextTypes = (_channelType: ChannelEntityType): string[] | null => [lisContextTypes.group];

/**
 * The LTI roles a launch sends for what the person may do in the context channel (`can`, the permission engine with
 * their access at launch), as full URIs (`lisContextRoles`). The app fills this pinned file. The default: whoever may
 * update the channel is an Instructor, whoever may only read it a Learner.
 */
export const ltiRolesFor = (_channelType: ChannelEntityType, can: (action: EntityActionType) => boolean): string[] =>
  can('update') ? [lisContextRoles.instructor] : can('read') ? [lisContextRoles.learner] : [];
