import { appConfig } from '../config-builder/app-config';
import { hierarchy } from '../../config/hierarchy-config';
import type { ContextEntityType, ProductEntityType } from '../../types';
import { generateId } from '../utils/entity-id';
import type { ContextEntityIdColumns, ContextScope, SubjectForPermission } from './permission-manager/types';
import { validateAncestorScope } from './validate-ancestor-scope';

/**
 * Build a permission subject from an entity type and ancestor context ID columns.
 *
 * Extracts the relevant ancestor ID columns (e.g., `organizationId`, `projectId`) from the input
 * based on the entity hierarchy, validates that all required ancestors are present, and returns
 * a ready-to-use `SubjectForPermission` with domain-shaped `contextIds`. Extra properties on the
 * input are ignored.
 *
 * The `undefined` vs `null` distinction is preserved:
 * - `undefined` on the input -> omitted from the subject -> `validateAncestorScope` throws
 * - `null` on the input -> set on the subject -> means "intentionally not scoped to this context"
 *
 * @param entityType - The entity type to build a subject for
 * @param ancestorContextIds - Object containing ancestor ID values (e.g., route params, event data)
 * @param options.id - Entity ID (defaults to a generated ID for collection-level checks)
 * @param options.createdBy - Creator for ownership checks
 * @param options.row - Row fields for row-condition / public read evaluation
 * @param options.parentRow - Parent context row for parent-dependent rules (e.g. `publicRead: 'publicParent'`),
 *   resolved by the caller once per request/event
 * @throws MissingScopeError if any required ancestor context ID is missing (undefined)
 */
export const buildSubject = (
  entityType: ContextEntityType | ProductEntityType,
  ancestorContextIds: Partial<ContextEntityIdColumns>,
  options?: {
    id?: string;
    createdBy?: string | null;
    row?: Record<string, unknown>;
    parentRow?: Record<string, unknown>;
  },
): SubjectForPermission => {
  const contextIds: ContextScope = {};

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    const idKey = appConfig.entityIdColumnKeys[ancestor];
    const value = ancestorContextIds[idKey as keyof ContextEntityIdColumns];
    if (value !== undefined) {
      contextIds[ancestor] = value;
    }
  }

  const subject: SubjectForPermission = {
    entityType,
    id: options?.id ?? generateId(),
    contextIds,
    ...(options?.createdBy !== undefined && { createdBy: options.createdBy }),
    ...(options?.row !== undefined && { row: options.row }),
    ...(options?.parentRow !== undefined && { parentRow: options.parentRow }),
  };

  validateAncestorScope(subject);

  return subject;
};

export const buildSubjectFromEntity = (
  entityType: ContextEntityType | ProductEntityType,
  entity: { id: string; createdBy?: string | null } & Partial<ContextEntityIdColumns>,
): SubjectForPermission => buildSubject(entityType, entity, { id: entity.id, createdBy: entity.createdBy });
