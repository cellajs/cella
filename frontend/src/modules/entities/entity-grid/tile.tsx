import { Link } from '@tanstack/react-router';
import { t } from 'i18next';
import { User } from 'lucide-react';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import type { EntityGridItem } from '~/modules/entities/types';
import { Badge } from '~/modules/ui/badge';
import { Card, CardContent } from '~/modules/ui/card';
import { getEntityRoute } from '~/routes-resolver';
import { dateShort } from '~/utils/date-short';
import { numberToColorClass } from '~/utils/number-to-color-class';

export const EntityTile = ({ entity }: { entity: EntityGridItem }) => {
  const { to, params, search } = getEntityRoute(entity);
  return (
    <Card className="overflow-hidden transition hover:shadow-sm [&:has(.tile-link:focus-visible)]:ring-2 [&:has(.tile-link:active)]:translate-y-[.05rem] ring-ring ring-offset-2 ring-offset-background">
      <CardContent className="p-4">
        <Link to={to} params={params} search={search} className="w-full relative group tile-link focus-visible:outline-none focus-visible:ring-0">
          {typeof window !== 'undefined' && (
            <div
              className={`relative flex flex-col -mx-4 -mt-6 bg-cover bg-center aspect-[3/1] bg-opacity-80 ${
                entity.bannerUrl ? '' : numberToColorClass(entity.id)
              }`}
              style={entity.bannerUrl ? { backgroundImage: `url(${entity.bannerUrl})` } : {}}
            >
              <div className="grow" />
              <div className="flex w-full items-center backdrop-blur-xs gap-3 px-4 py-2 bg-background/40 group-hover:bg-background/60 transition-colors">
                <AvatarWrap className="h-10 w-10" type="organization" id={entity.id} name={entity.name} url={entity.thumbnailUrl} />
                <div className="flex flex-col grow gap-1 truncate">
                  <div className="font-semibold truncate leading-4">{entity.name}</div>
                  <div className="text-sm font-light inline-flex items-center gap-2">
                    {dateShort(entity.createdAt)}
                    {entity.membership?.role && <Badge variant="plain">{t(entity.membership.role, { ns: ['app', 'common'] })}</Badge>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Link>

        <div className="flex items-center justify-end gap-3 pt-6 text-sm opacity-80">
          <div className="flex items-center gap-1">
            <User size={16} />
            {entity.membershipCounts.total}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
