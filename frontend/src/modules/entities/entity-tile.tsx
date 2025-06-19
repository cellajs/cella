import { Link } from '@tanstack/react-router';
import { t } from 'i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import type { EntityGreidItems } from '~/modules/entities/types';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { Card, CardContent } from '~/modules/ui/card';
import { getEntityRoute } from '~/nav-config';
import { dateShort } from '~/utils/date-short';
import { numberToColorClass } from '~/utils/number-to-color-class';

export const EntityTile = ({ entity }: { entity: EntityGreidItems[number] }) => {
  const { to, params } = getEntityRoute(entity);
  return (
    <Card className="overflow-hidden transition hover:shadow-sm">
      <CardContent className="p-4">
        <Link to={to} params={params} className="w-full relative group">
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
                <div className="flex flex-col grow gap-1">
                  <div className="font-semibold leading-3">{entity.name}</div>
                  <div className="text-sm font-light opacity-70 group-hover:opacity-85 transition-opacity">
                    {dateShort(entity.createdAt)}
                    {entity.membership?.role ? ` | ${t(entity.membership.role, { ns: ['app', 'common'] })}` : ''}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Link>

        <div className="flex items-center justify-stretch gap-3 pt-3">
          <div className="grow" />
          <AvatarGroup limit={3}>
            <AvatarGroupList>
              {entity.members.map((user) => (
                <AvatarWrap type="user" key={user.id} id={user.id} name={user.name} url={user.thumbnailUrl} className="h-8 w-8 text-xs" />
              ))}
            </AvatarGroupList>
            <AvatarOverflowIndicator className="h-8 w-8 text-xs" />
          </AvatarGroup>
        </div>
      </CardContent>
    </Card>
  );
};
