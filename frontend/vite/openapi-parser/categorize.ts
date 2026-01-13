/**
 * Categorization helpers for OpenAPI schemas.
 */

export type SchemaTag = 'base' | 'data' | 'errors';

/**
 * Categorize a schema into a schema tag based on its name.
 * - Schemas with "error" in the name → 'errors'
 * - Schemas with "base" in the name → 'base'
 * - Everything else → 'data'
 */
export function getSchemaTag(schemaName: string): SchemaTag {
  const lowerName = schemaName.toLowerCase();
  if (lowerName.includes('error')) return 'errors';
  if (lowerName.includes('base')) return 'base';
  return 'data';
}
