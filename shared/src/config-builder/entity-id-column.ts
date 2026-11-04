import { toColumnName } from '../utils/schema-naming.ts';

/**
 * The id-column key convention (`project` to `projectId`). Config validation pins
 * `appConfig.entityIdColumnKeys` to this shape, so it also holds for entity types absent from
 * the current app's config.
 */
export const entityIdColumnKey = <T extends string>(entityType: T): `${T}Id` => `${entityType}Id`;

/** The id column's SQL name (`courseSection` to `course_section_id`). */
export const entityIdColumnName = (entityType: string): string => `${toColumnName(entityType)}_id`;
