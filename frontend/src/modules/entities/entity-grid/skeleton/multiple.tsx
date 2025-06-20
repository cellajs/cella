import { t } from 'i18next';
import { Fragment } from 'react/jsx-runtime';
import { GridSkeletonItem } from '~/modules/entities/entity-grid/skeleton//item';
import { getEntityPlaceholder } from '~/modules/entities/entity-grid/skeleton/get-entity-placeholder';
import type { EntityGrid } from '~/modules/entities/entity-grid/types';

export const MultipleGridSkeleton = ({ passedEntities }: { passedEntities: EntityGrid[] }) => {
  return (
    <>
      {passedEntities.map(({ entityType }) => {
        const entities = getEntityPlaceholder(entityType, 5);
        return (
          <Fragment key={entityType}>
            <span>{t(entityType, { ns: ['app', 'common'] })}</span>
            <div className="mb-12 grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
              {entities.map(({ id, name, members }) => (
                <GridSkeletonItem key={id} name={name} members={members} />
              ))}
            </div>
          </Fragment>
        );
      })}
    </>
  );
};
