import { toColumnName } from '../permissions/schema-naming.ts';

/**
 * The id-column key convention (`project` to `projectId`). Config validation pins
 * `appConfig.entityIdColumnKeys` to this shape, so it also holds for entity types absent from
 * the current app's config.
 */
export const entityIdColumnKey = (entityType: string): string => `${entityType}Id`;

/** The id column's SQL name (`courseSection` to `course_section_id`). */
export const entityIdColumnName = (entityType: string): string => `${toColumnName(entityType)}_id`;
