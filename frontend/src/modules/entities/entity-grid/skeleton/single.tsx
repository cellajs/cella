import type { ContextEntityType } from 'config';
import { GridSkeletonItem } from '~/modules/entities/entity-grid/skeleton//item';
import { getEntityPlaceholder } from '~/modules/entities/entity-grid/skeleton/get-entity-placeholder';

export const SingleGridSkeleton = ({ entityType }: { entityType: ContextEntityType }) => {
  const entities = getEntityPlaceholder(entityType);
  return (
    <div className="mb-12 grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
      {entities.map(({ id, name, members }) => (
        <GridSkeletonItem key={id} name={name} members={members} />
      ))}
    </div>
  );
};
