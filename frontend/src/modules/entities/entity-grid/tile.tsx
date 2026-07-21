import { Link } from '@tanstack/react-router';
import { t } from 'i18next';
import { UserIcon } from 'lucide-react';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { EnrichedChannelEntity } from '~/modules/entities/types';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardFooter } from '~/modules/ui/card';
import { getChannelEntityRoute, pageTopHashNav } from '~/utils/channel-entity-route';
import { dateShort } from '~/utils/date-short';
import { numberToColorClass } from '~/utils/number-to-color-class';

/**
 * Structural tile entity: any channel entity whose optional `included.counts`
 * carries a membership total fits, without coupling to a concrete entity type.
 */
type ChannelTileEntity = EnrichedChannelEntity & {
  included?: { counts?: { membership: { total: number } } };
};

/**
 * Tile component to display an entity in a grid layout.
 */
export const ChannelEntityGridTile = ({ entity }: { entity: ChannelTileEntity }) => {
  const { to, params, search } = getChannelEntityRoute(entity);
  const counts = entity.included?.counts;
  return (
    <Card className="overflow-hidden px-0 pt-0 shadow-xs transition sm:px-0 sm:pt-0 [&:has(.tile-link:active)]:translate-y-[.05rem] [&:has(.tile-link:focus-visible)]:ring-2 [&:has(.tile-link:focus-visible)]:ring-ring [&:has(.tile-link:focus-visible)]:ring-offset-2 [&:has(.tile-link:focus-visible)]:ring-offset-background [&:has(.tile-link:hover)]:shadow-sm">
      <CardContent className="p-0 sm:p-0">
        <Link
          to={to}
          params={params}
          search={search}
          {...pageTopHashNav}
          className="group tile-link relative w-full focus-visible:outline-none focus-visible:ring-0"
        >
          <div
            className={`relative flex aspect-3/1 min-h-30 w-full flex-col bg-center bg-cover bg-opacity-80 ${
              entity.bannerUrl ? '' : numberToColorClass(entity.id)
            }`}
            style={entity.bannerUrl ? { backgroundImage: `url(${entity.bannerUrl})` } : {}}
          >
            <div className="grow" />
            <div className="flex min-h-14 w-full items-center gap-3 bg-background/50 px-4 py-2 backdrop-blur-xs transition-colors group-hover:bg-background/70">
              <EntityAvatar
                className="h-10 w-10"
                type={entity.entityType}
                id={entity.id}
                name={entity.name}
                url={entity.thumbnailUrl}
              />
              <div className="flex grow flex-col gap-0.5 truncate">
                <div className="truncate font-semibold text-sm leading-5">{entity.name}</div>
                <div className="inline-flex items-center gap-2 text-sm">
                  {entity.membership?.role && <Badge variant="plain">{t(entity.membership.role)}</Badge>}
                  {dateShort(entity.createdAt)}
                </div>
              </div>
            </div>
          </div>
        </Link>
      </CardContent>
      {counts && (
        <CardFooter>
          <div className="flex w-full items-center justify-end gap-3 text-sm opacity-80">
            <div className="flex items-center gap-1">
              <UserIcon />
              {counts.membership.total}
            </div>
          </div>
        </CardFooter>
      )}
    </Card>
  );
};
