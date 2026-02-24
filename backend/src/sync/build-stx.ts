import type { StxBase, StxRequest } from '#/schemas/sync-transaction-schemas';
import { buildFieldVersions } from './field-versions';

/**
 * Build StxBase metadata for entity create or update mutations.
 * Entity-agnostic — works for any product entity with stx support.
 *
 * **Create** (no entity/changedFields): version 1, empty fieldVersions.
 * ```ts
 * stx: buildStx(stx)
 * ```
 *
 * **Update** (with entity + changedFields): incremented version, merged fieldVersions.
 * ```ts
 * stx: buildStx(stx, entity, changedFields)
 * ```
 */
export function buildStx(
  stx: Pick<StxRequest, 'mutationId' | 'sourceId'>,
  entity?: { stx?: StxBase | null },
  changedFields?: string[],
): StxBase {
  const version = entity ? (entity.stx?.version ?? 0) + 1 : 1;

  return {
    mutationId: stx.mutationId,
    sourceId: stx.sourceId,
    version,
    fieldVersions: entity && changedFields ? buildFieldVersions(entity.stx?.fieldVersions, changedFields, version) : {},
  };
}
