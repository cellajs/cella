import i18n from 'i18next';
import { type ChannelEntityType, hierarchy } from 'shared';

/** The roles invited at once to a draft of this channel type, as a lowercase list ("admins", "staff and coaches"). */
export const prepareRolesText = (channelType: ChannelEntityType) =>
  new Intl.ListFormat(i18n.resolvedLanguage, { type: 'conjunction' }).format(
    hierarchy.getPrepareRoles(channelType).map((role) => i18n.t(`c:${role}`, { count: 2 }).toLowerCase()),
  );
