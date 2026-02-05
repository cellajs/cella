import { Link } from '@tanstack/react-router';
import { t } from 'i18next';
import { UserIcon } from 'lucide-react';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import type { ContextEntityData } from '~/modules/entities/types';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent, CardFooter } from '~/modules/ui/card';
import { getContextEntityRoute } from '~/routes-resolver';
import { dateShort } from '~/utils/date-short';
import { numberToColorClass } from '~/utils/number-to-color-class';

/**
 * Tile component to display an entity in a grid layout.
 */
export const EntityGridTile = ({ entity }: { entity: ContextEntityData }) => {
  const { to, params, search } = getContextEntityRoute(entity);
  return (
    <Card className="overflow-hidden px-0 sm:px-0 pt-0 sm:pt-0 transition [&:has(.tile-link:hover)]:shadow-sm shadow-xs [&:has(.tile-link:focus-visible)]:ring-2 [&:has(.tile-link:active)]:translate-y-[.05rem] [&:has(.tile-link:focus-visible)]:ring-ring [&:has(.tile-link:focus-visible)]:ring-offset-2 [&:has(.tile-link:focus-visible)]:ring-offset-background">
      <CardContent className="p-0 sm:p-0">
        <Link
          to={to}
          params={params}
          search={search}
          className="w-full relative group tile-link focus-visible:outline-none focus-visible:ring-0"
        >
          {typeof window !== 'undefined' && (
            <div
              className={`w-full relative flex flex-col bg-cover min-h-30 bg-center aspect-3/1 bg-opacity-80 ${
                entity.bannerUrl ? '' : numberToColorClass(entity.id)
              }`}
              style={entity.bannerUrl ? { backgroundImage: `url(${entity.bannerUrl})` } : {}}
            >
              <div className="grow" />
              <div className="flex w-full items-center backdrop-blur-xs gap-3 px-4 py-2 min-h-14 bg-background/50 group-hover:bg-background/70 transition-colors">
                <AvatarWrap
                  className="h-10 w-10"
                  type="organization"
                  id={entity.id}
                  name={entity.name}
                  url={entity.thumbnailUrl}
                />
                <div className="flex flex-col grow gap-0.5 truncate">
                  <div className="font-semibold truncate leading-5 text-sm">{entity.name}</div>
                  <div className="text-sm font-light inline-flex items-center gap-2">
                    {entity.membership?.role && (
                      <Badge variant="plain">{t(entity.membership.role, { ns: ['app', 'common'] })}</Badge>
                    )}
                    {dateShort(entity.createdAt)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Link>
      </CardContent>
      {entity.counts && (
        <CardFooter>
          <div className="w-full flex items-center justify-end gap-3 text-sm opacity-80">
            <div className="flex items-center gap-1">
              <UserIcon size={16} />
              {entity.counts.membership.total}
            </div>
          </div>
        </CardFooter>
      )}
    </Card>
  );
};
