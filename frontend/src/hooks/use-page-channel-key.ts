import { useParams } from '@tanstack/react-router';
import { appConfig } from 'shared';
import { channelRouteConfig } from '~/routes-config';

/**
 * Return a stable composite key for the route's deepest channel, or undefined outside channels.
 * It changes on channel navigation but not tab changes within the same channel.
 */
export const usePageChannelKey = (): string | undefined => {
  const params = useParams({ strict: false }) as Record<string, string | undefined>;

  const parts = appConfig.channelEntityTypes
    .map((type) => params[channelRouteConfig[type]?.paramName ?? ''])
    .filter((value): value is string => !!value);

  return parts.length ? parts.join('/') : undefined;
};
