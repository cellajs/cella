import { useParams } from '@tanstack/react-router';
import { appConfig } from 'shared';
import { channelRouteConfig } from '~/routes-config';

/** Composite key for the route's deepest channel, undefined outside channels. Stable across tab changes. */
export const usePageChannelKey = (): string | undefined => {
  const params = useParams({ strict: false }) as Record<string, string | undefined>;

  const parts = appConfig.channelEntityTypes
    .map((type) => params[channelRouteConfig[type]?.paramName ?? ''])
    .filter((value): value is string => !!value);

  return parts.length ? parts.join('/') : undefined;
};
