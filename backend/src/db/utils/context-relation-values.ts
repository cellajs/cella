import type { z } from '@hono/zod-openapi';
import {
  type AncestorContextType,
  appConfig,
  type ContextEntityType,
  type EntityIdColumnKey,
  type EntityType,
  hierarchy,
  type ProductEntityType,
  type RelatedContextType,
} from 'shared';
import { validUuidSchema } from '#/schemas';

/** The root context entity type (parentless context, e.g. 'organization'). Provided by the route path. */
const rootContextType = hierarchy.contextTypes.find((t) => hierarchy.getParent(t) === null) as ContextEntityType;

/**
 * Runtime context-entity id values a product entity carries, mirroring its DB schema
 * (see `contextRelationColumns`): strict ancestors are required, declared related contexts are nullable.
 *
 * Key names come from `entityIdColumnKeys` (single source of truth) rather than a re-derived
 * `${C}Id` template literal, so type and runtime stay in lockstep.
 */
export type ContextRelationValues<E extends string> = {
  [C in AncestorContextType<E> & EntityType as EntityIdColumnKey<C>]: string;
} & {
  [C in RelatedContextType<E> & EntityType as EntityIdColumnKey<C>]: string | null;
};

/**
 * Builds the exact set of context-entity id values a product entity needs on insert, derived from
 * the hierarchy (ancestors + relatedContexts). Ancestor ids are required and read from `source`
 * (throws if missing); related context ids default to `null` when absent. Keeps cella-origin insert
 * sites fork-agnostic: forks only adjust the hierarchy, not each insert payload.
 */
export const buildContextRelationValues = <E extends ProductEntityType>(
  entityType: E,
  source: Record<string, unknown>,
): ContextRelationValues<E> => {
  const values = {} as Record<string, string | null>;

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    const key = appConfig.entityIdColumnKeys[ancestor];
    const value = source[key];
    if (typeof value !== 'string') {
      throw new Error(`buildContextRelationValues: missing required context id "${key}" for "${entityType}"`);
    }
    values[key] = value;
  }
  for (const related of hierarchy.getRelatedContexts(entityType)) {
    const key = appConfig.entityIdColumnKeys[related];
    const value = source[key];
    values[key] = typeof value === 'string' ? value : null;
  }

  return values as ContextRelationValues<E>;
};

/**
 * Zod shape for the context-entity id fields a product entity create body may carry, derived from
 * the hierarchy. Excludes the root context (e.g. 'organization'), which is supplied by the route path.
 * Fields are optional/nullish at the boundary; the create operation enforces presence of the ones the
 * schema requires (see `buildContextRelationValues`) so org-scoped callers fail with a clear 4xx rather
 * than a type error. In cella's default hierarchy this yields an empty shape, so cella-origin create
 * schemas remain unchanged.
 */
export const contextRelationBodyShape = (entityType: ProductEntityType): Record<string, z.ZodTypeAny> => {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    if (ancestor === rootContextType) continue;
    shape[appConfig.entityIdColumnKeys[ancestor]] = validUuidSchema.optional();
  }
  for (const related of hierarchy.getRelatedContexts(entityType)) {
    shape[appConfig.entityIdColumnKeys[related]] = validUuidSchema.nullish();
  }

  return shape;
};
