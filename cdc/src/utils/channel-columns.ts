import type { ChannelIdColumns } from 'shared';
import { appConfig } from 'shared';

/** Id column keys for every channel entity type, e.g. `['organizationId']`: one list from `channelEntityTypes` for every reader. */
export const channelIdColumnKeys: ReadonlyArray<keyof ChannelIdColumns> = appConfig.channelEntityTypes.map(
  (type) => appConfig.entityIdColumnKeys[type],
);
