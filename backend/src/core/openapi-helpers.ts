import type { SchemaKind } from '#/core/openapi-tag-registry';

/** Schema-kind, module and owner tags; `openapi-registration` validates the names after all modules register. */
export const schemaTags = (kind: SchemaKind, ...tags: string[]): string[] => [kind, ...tags];

/** `ServiceAccount`, `serviceAccount` and `service_account` as `service-account`. */
export const toKebabCase = (text: string) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
