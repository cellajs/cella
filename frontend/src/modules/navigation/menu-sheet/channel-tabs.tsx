import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { resolveChannelTabs } from '~/modules/common/page/tab-nav';
import { useChannelTabOptions } from '~/modules/entities/use-channel-tab-options';
import type { UserMenuItem } from '~/modules/me/types';
import { getChannelRouteParams } from '~/utils/channel-route';
import { cn } from '~/utils/cn';

/** A channel's page tabs as menu rows, for a channel type whose tabs show in the menu (`appConfig.navigation.pageTabs`). */
export function MenuSheetChannelTabs({ channel, className }: { channel: UserMenuItem; className?: string }) {
  const { t } = useTranslation();
  const tabOptions = useChannelTabOptions(channel);
  const tabs = resolveChannelTabs(channel.entityType, getChannelRouteParams(channel), tabOptions);

  if (!tabs.length) return null;

  return (
    <nav aria-label={channel.name} className={className}>
      <ul className="flex flex-col gap-0.5">
        {tabs.map(({ id, label, path, params }) => (
          <li key={id}>
            <Link
              to={path}
              params={params}
              draggable={false}
              resetScroll={false}
              activeOptions={{ exact: true, includeSearch: false }}
              activeProps={{ 'data-active': true }}
              className={cn(
                'focus-effect focus-inset text-muted-foreground sm:hover:bg-hover sm:hover:text-foreground flex h-10 items-center rounded-sm px-3 text-sm',
                'data-[active=true]:bg-accent data-[active=true]:text-foreground data-[active=true]:font-medium',
              )}
            >
              {t(label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
