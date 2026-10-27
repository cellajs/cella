/** A sub-organization channel carries its organization's id; an organization is its own. */
export const channelOrganizationId = (channel: { id: string; organizationId?: string | null }) => channel.organizationId ?? channel.id;
