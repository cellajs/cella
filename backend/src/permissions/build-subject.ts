import type { ChannelEntityIdColumns, ChannelEntityType, ProductEntityType, SubjectForPermission } from 'shared';
import {
  MissingScopeError,
  buildSubject as sharedBuildSubject,
  buildSubjectFromEntity as sharedBuildSubjectFromEntity,
} from 'shared';
import { AppError } from '#/core/error';

/**
 * Translate the tier-neutral `MissingScopeError` thrown by the shared engine into the backend's
 * `AppError(400, 'missing_scope')`, preserving the exact HTTP behavior callers relied on before
 * the engine moved into `shared`.
 */
const translateMissingScope = (e: unknown): never => {
  if (e instanceof MissingScopeError) {
    throw new AppError(400, 'missing_scope', 'error', {
      entityType: e.entityType,
      meta: { missingChannel: e.missingChannel, missingKey: e.missingKey },
    });
  }
  throw e;
};

/**
 * Build a permission subject from an entity type and ancestor context ID columns.
 *
 * Thin backend wrapper over the shared `buildSubject` that translates `MissingScopeError` to
 * `AppError(400, 'missing_scope')`. See the shared implementation for full semantics.
 *
 * @throws AppError 400 if any required ancestor context ID is missing (undefined)
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
  try {
    return sharedBuildSubject(entityType, ancestorChannelIds, options);
  } catch (e) {
    return translateMissingScope(e);
  }
};

export const buildSubjectFromEntity = (
  entityType: ChannelEntityType | ProductEntityType,
  entity: { id: string; createdBy?: string | null } & Partial<ChannelEntityIdColumns>,
): SubjectForPermission => {
  try {
    return sharedBuildSubjectFromEntity(entityType, entity);
  } catch (e) {
    return translateMissingScope(e);
  }
};
