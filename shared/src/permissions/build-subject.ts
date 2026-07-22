import { appConfig } from '../config-builder/app-config';
import { hierarchy } from '../../config/hierarchy-config';
import type { ChannelEntityType, ProductEntityType } from '../../types';
import { generateId } from '../utils/entity-id';
import type { AncestorChannelIds, ChannelIdColumns, SubjectForPermission } from './permission-manager/types';
import { validateAncestorScope } from './validate-ancestor-scope';

/**
 * Builds a permission subject from database-shaped ancestor ID columns, ignoring unrelated
 * properties. `null` marks an unused ancestor; `undefined` fails validation.
 *
 * @throws MissingScopeError if any required ancestor context ID is missing (undefined)
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
  const channelIds: AncestorChannelIds = {};

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    const idKey = appConfig.entityIdColumnKeys[ancestor];
    const value = ancestorChannelIds[idKey as keyof ChannelIdColumns];
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

/** Builds a subject from a resolved DB row and exposes the full row to row-derived rules. */
export const buildSubjectFromEntity = (
  entityType: ChannelEntityType | ProductEntityType,
  entity: { id: string; createdBy?: string | null } & Partial<ChannelIdColumns> & Record<string, unknown>,
): SubjectForPermission =>
  buildSubject(entityType, entity, {
    id: entity.id,
    createdBy: entity.createdBy,
    row: entity as Record<string, unknown>,
  });
