import type { ContextEntityType, ProductEntityType } from 'shared';
import { appConfig, hierarchy } from 'shared';
import { generateId } from 'shared/entity-id';
import type { ContextEntityIdColumns, SubjectForPermission } from '#/permissions/permission-manager/types';
import { validateAncestorScope } from '#/permissions/validate-ancestor-scope';

// TODO this is a blackbox, we need to add constraints/explicit about what can be input, this will also make it more readable
/**
 * Build a permission subject from an entity type and a source object containing ancestor context IDs.
 *
 * Extracts the relevant ancestor ID columns (e.g., `organizationId`, `projectId`) from the source
 * based on the entity hierarchy, validates that all required ancestors are present, and returns
 * a ready-to-use `SubjectForPermission`. Extra properties on the source are ignored.
 *
 * The `undefined` vs `null` distinction is preserved:
 * - `undefined` on the source → omitted from the subject → `validateAncestorScope` throws 400
 * - `null` on the source → set on the subject → means "intentionally not scoped to this context"
 *
 * @param entityType - The entity type to build a subject for
 * @param source - Object containing ancestor ID values (e.g., route params, event data)
 * @param options.id - Entity ID (defaults to a generated ID for collection-level checks)
 * @param options.createdBy - Creator for ownership checks
 * @throws AppError 400 if any required ancestor context ID is missing (undefined)
 */
export const buildSubject = (
  entityType: ContextEntityType | ProductEntityType,
  source: Partial<ContextEntityIdColumns>,
  options?: { id?: string; createdBy?: string | null },
): SubjectForPermission => {
  const subject: SubjectForPermission = {
    entityType,
    id: options?.id ?? generateId(),
    ...(options?.createdBy !== undefined && { createdBy: options.createdBy }),
  } as SubjectForPermission;

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    const idKey = appConfig.entityIdColumnKeys[ancestor];
    const value = source[idKey as keyof ContextEntityIdColumns];
    if (value !== undefined) {
      (subject as Record<string, unknown>)[idKey] = value;
    }
  }

  validateAncestorScope(subject);

  return subject;
};
