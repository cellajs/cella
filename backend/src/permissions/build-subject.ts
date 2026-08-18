import type { ChannelEntityType, ChannelIdColumns, ProductEntityType, SubjectForPermission } from 'shared';
import {
  MissingScopeError,
  buildSubject as sharedBuildSubject,
  buildSubjectFromEntity as sharedBuildSubjectFromEntity,
} from 'shared';
import { AppError } from '#/core/error';

/** Translate the shared engine's tier-neutral `MissingScopeError` into `AppError(400, 'missing_scope')`. */
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
 * Backend wrapper over the shared `buildSubject`; see it for full semantics.
 * @throws AppError 400 if any required ancestor channel ID is missing (undefined)
 */
export const buildSubject = (
  entityType: ChannelEntityType | ProductEntityType,
  ancestorChannelIds: Partial<ChannelIdColumns>,
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
  entity: { id: string; createdBy?: string | null } & Partial<ChannelIdColumns>,
): SubjectForPermission => {
  try {
    return sharedBuildSubjectFromEntity(entityType, entity);
  } catch (e) {
    return translateMissingScope(e);
  }
};
