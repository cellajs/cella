import type { ChannelIdColumns } from 'shared';
import { appConfig } from 'shared';

/**
 * Id column keys for every channel entity type, e.g. `['organizationId']`. Shared by the activity
 * builder, the transaction buffer, and the delta planner so all three track `channelEntityTypes`.
 */
export const channelIdColumnKeys = appConfig.channelEntityTypes.map(
  (type) => appConfig.entityIdColumnKeys[type],
) as ReadonlyArray<keyof ChannelIdColumns>;
