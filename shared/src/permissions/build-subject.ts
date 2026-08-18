import { hierarchy } from '../../config/hierarchy-config.ts';
import type { ChannelEntityType, ProductEntityType } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';
import { generateId } from '../utils/entity-id.ts';
import type { AncestorChannelIds, ChannelIdColumns, SubjectForPermission } from './engine/types.ts';
import { validateAncestorScope } from './validate-ancestor-scope.ts';

/**
 * From database-shaped ancestor id columns, ignoring unrelated properties. `null` marks an
 * unused ancestor. @throws MissingScopeError when a required ancestor id is `undefined`
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

/** Exposes the full row to row-derived rules. */
export const buildSubjectFromEntity = (
  entityType: ChannelEntityType | ProductEntityType,
  entity: { id: string; createdBy?: string | null } & Partial<ChannelIdColumns> & Record<string, unknown>,
): SubjectForPermission =>
  buildSubject(entityType, entity, {
    id: entity.id,
    createdBy: entity.createdBy,
    row: entity as Record<string, unknown>,
  });
