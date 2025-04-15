import { type PageEntity, config } from 'config';
import { useState } from 'react';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import type { entitiesQuerySchema } from '#/modules/entities/schema';
import { EntityGrid } from './entity-grid';
import { EntityGridBar } from './entity-grid-bar';

const LIMIT = config.requestLimits.default;

export type EntitySearch = Omit<z.infer<typeof entitiesQuerySchema>, 'removeSelf'>;

// TODO replace with real data for GET entities
const entities = Array.from({ length: 19 }).map((_, i) => ({
  id: `${i + 1}_id`,
  slug: `project-${i + 1}`,
  name: `Project ${i + 1}`,
  entity: 'organization' as const,
  description: `This is a mock description for project ${i + 1}.`,
  bannerUrl: '',
  membership: null,
  thumbnailUrl: `https://i.pravatar.cc/150?img=${i % 70}`,
  members: Array.from({ length: Math.floor(Math.random() * 5) + 1 }).map((_, j) => ({
    id: `${i + 1}-${j + 1}`,
    name: `User ${j + 1}`,
    slug: `user-${i + 1}-${j + 1}`,
    thumbnailUrl: `https://i.pravatar.cc/150?img=${(i + j) % 70}`,
    email: 'test@test.nl',
    entity: 'user' as const,
    bannerUrl: '',
  })),
}));

export interface Props {
  isSheet?: boolean;
  entityType: PageEntity;
  userId?: string;
}

const EntityGridWrapper = ({ isSheet = false }: Props) => {
  const { search, setSearch } = useSearchParams<EntitySearch>({ saveDataInSearch: !isSheet });

  // Table state
  const limit = LIMIT;

  // State for selected, total counts and entity
  const [total] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* @ts-expect-error TODO */}
      <EntityGridBar total={total} searchVars={{ ...search, limit }} setSearch={setSearch} isSheet={isSheet} />
      <EntityGrid entities={entities} />
    </div>
  );
};

export default EntityGridWrapper;
