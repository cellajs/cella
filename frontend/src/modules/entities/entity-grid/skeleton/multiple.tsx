import { t } from 'i18next';
import { Fragment } from 'react/jsx-runtime';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import type { BaseEntityGridProps } from '~/modules/entities/entity-grid';
import { getDummyEntities } from '~/modules/entities/entity-grid/skeleton/dummy-entities';
import { AvatarGroup, AvatarGroupList, AvatarOverflowIndicator } from '~/modules/ui/avatar';
import { Card, CardContent } from '~/modules/ui/card';
import { Skeleton } from '~/modules/ui/skeleton';

export const MultipleGridSkeleton = ({ passedEntities }: { passedEntities: BaseEntityGridProps['entities'] }) => {
  return (
    <>
      {passedEntities.map(({ entityType }) => {
        const entities = getDummyEntities(entityType, 5);
        return (
          <Fragment key={entityType}>
            <span>{t(entityType, { ns: ['app', 'common'] })}</span>
            <div className="mb-12 grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
              {entities.map(({ id, name, members }) => (
                <Card key={id} className="overflow-hidden transition hover:shadow-sm">
                  <CardContent className="p-4">
                    <Skeleton>
                      <div className="w-full relative group">
                        <div className={'relative flex flex-col -mx-4 -mt-6 bg-cover bg-center aspect-[3/1] bg-opacity-80 bg-gray-300'}>
                          <div className="grow" />
                          <div className="flex w-full items-center backdrop-blur-xs gap-3 px-4 py-2 bg-background/40 group-hover:bg-background/60 transition-colors">
                            <AvatarWrap className="h-10 w-10" name={name} />
                            <div className="flex flex-col grow gap-1">
                              <div className="font-semibold leading-3">{name}</div>
                              <div className="text-sm font-light opacity-70 group-hover:opacity-85 transition-opacity">date | role</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-stretch gap-3 pt-3">
                        <div className="grow" />
                        <AvatarGroup limit={3}>
                          <AvatarGroupList>
                            {members.map((member) => (
                              <AvatarWrap key={member.id} name={member.name} type="user" className="h-8 w-8 text-xs" />
                            ))}
                          </AvatarGroupList>
                          <AvatarOverflowIndicator className="h-8 w-8 text-xs" />
                        </AvatarGroup>
                      </div>
                    </Skeleton>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Fragment>
        );
      })}
    </>
  );
};
