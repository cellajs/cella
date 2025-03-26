import type { LimitedUser } from '../users/types';
import { EntityTile } from './entity-tile';
import type { EntityPage } from './types';

export type EntityTileData = EntityPage & {
  members: LimitedUser[];
};

export const EntityGrid = ({ entities }: { entities: EntityTileData[] }) => {
  return (
    <div className="mb-12 grid gap-6 grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
      {entities.map((entity) => (
        <EntityTile key={entity.id} entity={entity} />
      ))}
    </div>
  );
};
