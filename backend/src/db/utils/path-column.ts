import { sql } from 'drizzle-orm';
import { text } from 'drizzle-orm/pg-core';
import {
  type AncestorSource,
  appConfig,
  type ChannelEntityType,
  type EntityType,
  hierarchy,
  type ProductEntityType,
} from 'shared';

/**
 * Materialized id-path as a STORED generated column — the SQL twin of
 * `shared/src/config-builder/row-path.ts`. Root-first ancestor ids slash-joined,
 * null ancestors skipped (variable-depth rows); channel entities append their own id.
 *
 * Generated columns keep the path consistent with zero write-path changes: reparenting
 * a row (or hand-written fork ancestor columns changing) updates it atomically, and the
 * backfill is the ALTER TABLE itself. Every intermediate ancestor is COALESCE-wrapped so
 * one expression serves strict and nullable chains alike; the root ancestor id column
 * (organization) must be non-null — the hierarchy guarantees products an organization
 * ancestor, and fork channel tables must declare their organization column NOT NULL.
 */

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Raw SQL for a table's path: `"organization_id"::text || COALESCE('/' || "course_id"::text, '') || …`
 * (+ `|| '/' || "id"::text` when `appendOwnId`, i.e. channel entities). Exported with an
 * injectable hierarchy for synthetic-topology tests (cella's own 2-level config cannot
 * exhibit the COALESCE-skip behavior).
 */
export function pathColumnExpression(
  entityType: string,
  appendOwnId: boolean,
  h: AncestorSource = hierarchy,
  idColumnKeys: Record<string, string> = appConfig.entityIdColumnKeys,
): string {
  // getOrderedAncestors is most-specific → root; path segments are root-first.
  const rootFirst = [...h.getOrderedAncestors(entityType)].reverse();

  // Root channel (organization): the path is its own id.
  if (rootFirst.length === 0) return `"id"::text`;

  const [root, ...deeper] = rootFirst;
  const parts = [`"${toSnake(idColumnKeys[root])}"::text`];
  for (const ancestor of deeper) {
    parts.push(`COALESCE('/' || "${toSnake(idColumnKeys[ancestor])}"::text, '')`);
  }
  if (appendOwnId) parts.push(`'/' || "id"::text`);
  return parts.join(' || ');
}

/** Path column for a product entity table (ancestor chain only). */
export const productPathColumn = (entityType: ProductEntityType) => ({
  path: text('path').generatedAlwaysAs(sql.raw(pathColumnExpression(entityType as EntityType, false))),
});

/** Path column for a channel entity table (ancestor chain + own id). */
export const channelPathColumn = (entityType: ChannelEntityType) => ({
  path: text('path').generatedAlwaysAs(sql.raw(pathColumnExpression(entityType as EntityType, true))),
});
