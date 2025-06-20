import type { contextEntitiesQuerySchema } from '#/modules/entities/schema';
import type { ContextEntityType } from 'config';
import type { z } from 'zod';
import type { MembershipRoles } from '~/modules/memberships/types';

export type EntitySearch = Pick<z.infer<typeof contextEntitiesQuerySchema>, 'sort' | 'q'>;

export interface EntityGrid {
  entityType: ContextEntityType;
  roles?: MembershipRoles[];
}

export interface BaseGridCommonProps {
  isSheet?: boolean;
  userId?: string;
}

export type SingleEntityProps = EntityGrid & BaseGridCommonProps;

export interface MultipleEntityProps extends BaseGridCommonProps {
  entities: [EntityGrid, EntityGrid, ...EntityGrid[]]; // At least two entities
}

export type BaseEntityGridProps = SingleEntityProps | MultipleEntityProps;
