import { type Access, buildSubjectFromEntity, type ChannelEntityType, checkAccess } from 'shared';
import { ltiRolesFor } from '#/modules/lti-platform/launch-context';
import type { EntityModel } from '#/tables';

/**
 * A person's LTI roles in a channel: what their own access lets them do there, as the app-owned `ltiRolesFor` maps it.
 * A launch and a member row of the channel send the same roles.
 */
export const ltiRolesIn = (access: Access, channelType: ChannelEntityType, channel: EntityModel<ChannelEntityType>) =>
  ltiRolesFor(channelType, (action) => checkAccess(access, action, buildSubjectFromEntity(channelType, channel)).allowed);
