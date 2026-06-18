import type { ContextEntityType, ProductEntityType } from 'shared';
import { appConfig, hierarchy } from 'shared';
import { generateId } from 'shared/entity-id';
import type {
  ContextEntityIdColumns,
  ContextScope,
  SubjectForPermission,
} from '#/permissions/permission-manager/types';
import { validateAncestorScope } from '#/permissions/validate-ancestor-scope';

/**
 * Build a permission subject from an entity type and ancestor context ID columns.
 *
 * Extracts the relevant ancestor ID columns (e.g., `organizationId`, `projectId`) from the input
 * based on the entity hierarchy, validates that all required ancestors are present, and returns
 * a ready-to-use `SubjectForPermission` with domain-shaped `contextIds`. Extra properties on the
 * input are ignored.
 *
 * The `undefined` vs `null` distinction is preserved:
 * - `undefined` on the input -> omitted from the subject -> `validateAncestorScope` throws 400
 * - `null` on the input -> set on the subject -> means "intentionally not scoped to this context"
 *
 * @param entityType - The entity type to build a subject for
 * @param ancestorContextIds - Object containing ancestor ID values (e.g., route params, event data)
 * @param options.id - Entity ID (defaults to a generated ID for collection-level checks)
 * @param options.createdBy - Creator for ownership checks
 * @throws AppError 400 if any required ancestor context ID is missing (undefined)
 */
export const buildSubject = (
  entityType: ContextEntityType | ProductEntityType,
  ancestorContextIds: Partial<ContextEntityIdColumns>,
  options?: { id?: string; createdBy?: string | null },
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
  };

  validateAncestorScope(subject);

  return subject;
};

export const buildSubjectFromEntity = (
  entityType: ContextEntityType | ProductEntityType,
  entity: { id: string; createdBy?: string | null } & Partial<ContextEntityIdColumns>,
): SubjectForPermission => buildSubject(entityType, entity, { id: entity.id, createdBy: entity.createdBy });
