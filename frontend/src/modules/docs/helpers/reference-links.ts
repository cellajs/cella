import type { GenComponentSchema, GenOperationSummary } from 'sdk/docs-types';

/** Section id of a schema on the schemas page: its `$ref` path without the leading `#`. */
export const schemaAnchor = (schema: GenComponentSchema) => schema.ref.replace(/^#/, '');

// An API reference page renders a section's details only while its tag is open, so a link to a section opens that tag too.

/** Link to a schema on the schemas page. */
export const schemaLinkOptions = (schema: GenComponentSchema) => ({
  to: '/docs/schemas' as const,
  search: { schemaTag: schema.schemaTag },
  hash: schemaAnchor(schema),
});

/** Link to an operation on the operations page, in the section of its first tag. */
export const operationLinkOptions = (operation: GenOperationSummary) => ({
  to: '/docs/operations' as const,
  search: { operationTag: operation.tags[0] },
  hash: operation.hash,
});
