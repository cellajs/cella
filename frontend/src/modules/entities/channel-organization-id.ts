import type { EnrichedChannel } from '~/modules/entities/types';

/** A sub-organization channel carries its organization's id; an organization is its own. */
export const channelOrganizationId = (channel: Pick<EnrichedChannel, 'id' | 'organizationId'>) => channel.organizationId ?? channel.id;
