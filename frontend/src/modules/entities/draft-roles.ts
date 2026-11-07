import i18n from 'i18next';
import { type ChannelEntityType, hierarchy } from 'shared';
import { formatList } from '~/utils/format-list';

/** The roles invited at once to a draft of this channel type, as a lowercase list ("admins", "staff and coaches"). */
export const prepareRolesText = (channelType: ChannelEntityType) =>
  formatList(hierarchy.getPrepareRoles(channelType).map((role) => i18n.t(`c:${role}`, { count: 2 }).toLowerCase()));
