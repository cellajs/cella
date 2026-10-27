import { toColumnName } from '../permissions/schema-naming.ts';

/**
 * The id-column key convention (`project` to `projectId`). Config validation pins
 * `appConfig.entityIdColumnKeys` to this shape, so it also holds for entity types absent from
 * the current app's config.
 */
export const entityIdColumnKey = (entityType: string): string => `${entityType}Id`;

export const entityIdColumnName = (entityType: string): string => `${toColumnName(entityType)}_id`;

export interface ResolvedAncestor {
  /** Ancestor channel type (e.g. 'project'). */
  type: string;
  /** The row's id column for it (e.g. 'projectId'). */
  idColumn: string;
  /** Non-null ancestor row id. */
  id: string;
}
