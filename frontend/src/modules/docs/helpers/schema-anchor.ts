import type { GenComponentSchema } from 'sdk/docs-types';

/** Section id of a schema on the schemas page: its `$ref` path without the leading `#`. */
export const schemaAnchor = (schema: GenComponentSchema) => schema.ref.replace(/^#/, '');
