import type { SchemaKind } from '#/core/openapi-tag-registry';

/** Schema-kind, module and owner tags; `openapi-registration` validates the names after all modules register. */
export const schemaTags = (kind: SchemaKind, ...tags: string[]): string[] => [kind, ...tags];
