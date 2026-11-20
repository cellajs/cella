import type { ChannelEntityType, EntityActionType, EntityRole } from 'shared';
import { lisContextRoles, lisContextTypes, lisInstitutionRoles } from '#/lib/lti-vocabulary';

/**
 * Whether a channel type is an LTI context, and of which LIS context types (`lisContextTypes`); null for a channel type
 * that is none. A launch names the resource link's own channel as its context when it is one, else no context, and
 * only a context's channel holds LTI tabs, the organization excepted. The app fills this pinned file. The default:
 * every channel is a context, a group.
 */
export const ltiContextTypes = (_channelType: ChannelEntityType): string[] | null => [lisContextTypes.group];

/**
 * The LTI context roles a launch or a member row sends for a person, as full URIs (`lisContextRoles`). `can` is what the
 * permission engine lets them do in the context channel, judged as the tab's audience admitted them: on a tab for its
 * members and in a member row by their one membership there, on a tab for its editors by all they hold. `role` is their
 * role in that channel, null without a membership there: an app tells roles with the same rights apart by it. The app
 * fills this pinned file. The default: whoever may update the channel is an Instructor, whoever may only read it a Learner.
 */
export const ltiRolesFor = (_channelType: ChannelEntityType, can: (action: EntityActionType) => boolean, _role: EntityRole | null): string[] =>
  can('update') ? [lisContextRoles.instructor] : can('read') ? [lisContextRoles.learner] : [];

/**
 * The LIS institution roles every launch sends, with or without a context, as full URIs (`lisInstitutionRoles`). `can`
 * is what the person's own membership in the organization lets them do there, false for every action without one, and
 * `role` that membership's role, null without one. The app fills this pinned file. The default: Administrator for
 * whoever may update the organization, nothing for anyone else.
 */
export const ltiInstitutionRolesFor = (can: (action: EntityActionType) => boolean, _role: EntityRole | null): string[] =>
  can('update') ? [lisInstitutionRoles.administrator] : [];
