import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { resolveChannelTabs } from '~/modules/common/page/tab-nav';
import { useChannelTabOptions } from '~/modules/entities/use-channel-tab-options';
import type { UserMenuItem } from '~/modules/me/types';
import { getChannelRouteParams } from '~/utils/channel-route';
import { cn } from '~/utils/cn';

interface MenuSheetChannelTabsProps {
  channel: UserMenuItem;
  className?: string;
}

/** A channel's page tabs as menu rows, for a channel type whose tabs show in the menu (`appConfig.navigation.pageTabs`). */
export function MenuSheetChannelTabs({ channel, className }: MenuSheetChannelTabsProps) {
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
                'focus-effect flex h-10 items-center rounded-sm px-3 text-muted-foreground text-sm sm:hover:bg-accent sm:hover:text-foreground',
                'data-[active=true]:bg-accent data-[active=true]:font-medium data-[active=true]:text-foreground',
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
