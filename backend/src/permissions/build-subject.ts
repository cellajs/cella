import type { ChannelEntityType, ChannelIdColumns, ProductEntityType, SubjectForPermission } from 'shared';
import {
  MissingAncestorError,
  buildSubject as sharedBuildSubject,
  buildSubjectFromEntity as sharedBuildSubjectFromEntity,
  validateAncestorScope as sharedValidateAncestorScope,
} from 'shared';
import { AppError } from '#/core/error';

/** Translate the shared engine's tier-neutral `MissingAncestorError` into `AppError(400, 'missing_ancestor')`. */
const translateMissingScope = (e: unknown): never => {
  if (e instanceof MissingAncestorError) {
    throw new AppError(400, 'missing_ancestor', 'error', {
      entityType: e.entityType,
      meta: { missingChannel: e.missingChannel, missingKey: e.missingKey },
    });
  }
  throw e;
};

/**
 * Backend wrapper over the shared `buildSubject`; see it for full semantics.
 * @throws AppError 400 if any required ancestor channel ID is missing (undefined)
 */
export const buildSubject = (
  entityType: ChannelEntityType | ProductEntityType,
  ancestorChannelIds: Partial<ChannelIdColumns>,
  options?: { id?: string; createdBy?: string | null; row?: Record<string, unknown> },
): SubjectForPermission => {
  try {
    return sharedBuildSubject(entityType, ancestorChannelIds, options);
  } catch (e) {
    return translateMissingScope(e);
  }
};

export const buildSubjectFromEntity = (
  entityType: ChannelEntityType | ProductEntityType,
  entity: { id: string; createdBy?: string | null } & Partial<ChannelIdColumns>,
): SubjectForPermission => {
  try {
    return sharedBuildSubjectFromEntity(entityType, entity);
  } catch (e) {
    return translateMissingScope(e);
  }
};

/**
 * Backend wrapper over the shared `validateAncestorScope`: every ancestor channel ID must be present on the subject.
 * @throws AppError 400 if any ancestor channel ID is undefined (missing)
 */
export const validateAncestorScope = (entity: SubjectForPermission): void => {
  try {
    sharedValidateAncestorScope(entity);
  } catch (e) {
    translateMissingScope(e);
  }
};
