import type { ChannelEntityType, EntityActionType } from 'shared';
import { lisContextRoles, lisContextTypes, lisInstitutionRoles } from '#/lib/lti-vocabulary';

/**
 * Whether a channel type is an LTI context, and of which LIS context types (`lisContextTypes`); null for a channel type
 * that is none. A launch names the resource link's own channel as its context when it is one, else no context, and
 * only a context's channel holds LTI tabs, the organization excepted. The app fills this pinned file. The default:
 * every channel is a context, a group.
 */
export const ltiContextTypes = (_channelType: ChannelEntityType): string[] | null => [lisContextTypes.group];

/**
 * The LTI context roles a launch and a member row send for what the person's own membership in the context channel lets
 * them do (`can`, the permission engine with that one membership), as full URIs (`lisContextRoles`). Power that reaches
 * them from a channel above counts for nothing. A person without a membership there gets no call: only a tab for its
 * editors lets them in, as the context role Administrator (`ltiLaunchRoles`). The app fills this pinned file. The
 * default: whoever may update the channel is an Instructor, whoever may only read it a Learner.
 */
export const ltiRolesFor = (_channelType: ChannelEntityType, can: (action: EntityActionType) => boolean): string[] =>
  can('update') ? [lisContextRoles.instructor] : can('read') ? [lisContextRoles.learner] : [];

/**
 * The LIS institution roles every launch sends, with or without a context, for what the person's own membership in the
 * organization lets them do there (`can`; false for every action without one), as full URIs (`lisInstitutionRoles`).
 * The app fills this pinned file. The default: whoever may update the organization is an Administrator, anyone else a
 * Member.
 */
export const ltiInstitutionRolesFor = (can: (action: EntityActionType) => boolean): string[] =>
  can('update') ? [lisInstitutionRoles.administrator] : [lisInstitutionRoles.member];
