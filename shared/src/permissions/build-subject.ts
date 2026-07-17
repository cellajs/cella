import { appConfig } from '../config-builder/app-config';
import { hierarchy } from '../../config/hierarchy-config';
import type { ChannelEntityType, ProductEntityType } from '../../types';
import { generateId } from '../utils/entity-id';
import type { ChannelEntityIdColumns, ChannelScope, SubjectForPermission } from './permission-manager/types';
import { validateAncestorScope } from './validate-ancestor-scope';

/**
 * Build a permission subject from an entity type and ancestor context ID columns. Extracts the
 * relevant ancestor ID columns (e.g. `organizationId`, `projectId`) per the hierarchy, validates all
 * required ancestors are present, and returns a `SubjectForPermission` with domain-shaped
 * `channelIds`. Extra input properties are ignored.
 *
 * The `undefined` vs `null` distinction is preserved:
 * - `undefined` on the input → omitted → `validateAncestorScope` throws
 * - `null` on the input → set on the subject → "intentionally not scoped to this context"
 *
 * @throws MissingScopeError if any required ancestor context ID is missing (undefined)
 */
export const buildSubject = (
  entityType: ChannelEntityType | ProductEntityType,
  ancestorChannelIds: Partial<ChannelEntityIdColumns>,
  options?: {
    id?: string;
    createdBy?: string | null;
    row?: Record<string, unknown>;
  },
): SubjectForPermission => {
  const channelIds: ChannelScope = {};

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    const idKey = appConfig.entityIdColumnKeys[ancestor];
    const value = ancestorChannelIds[idKey as keyof ChannelEntityIdColumns];
    if (value !== undefined) {
      channelIds[ancestor] = value;
    }
  }

  const subject: SubjectForPermission = {
    entityType,
    id: options?.id ?? generateId(),
    channelIds,
    ...(options?.createdBy !== undefined && { createdBy: options.createdBy }),
    ...(options?.row !== undefined && { row: options.row }),
  };

  validateAncestorScope(subject);

  return subject;
};

/**
 * Build a subject from a resolved DB row.
 *
 * The row is passed through as `row`, so every row-derived rule. `'own'`, public read, and
 * any fork condition: evaluates from real data. Omitting it would fail those grants closed
 * on every single-row check, which is exactly the bug this shape prevents.
 */
export const buildSubjectFromEntity = (
  entityType: ChannelEntityType | ProductEntityType,
  // Accepts the whole row: extra columns are exactly what row-derived rules read.
  entity: { id: string; createdBy?: string | null } & Partial<ChannelEntityIdColumns> & Record<string, unknown>,
): SubjectForPermission =>
  buildSubject(entityType, entity, {
    id: entity.id,
    createdBy: entity.createdBy,
    row: entity as Record<string, unknown>,
  });
