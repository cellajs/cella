/**
 * Tags an OpenAPI schema with registered schema-kind, module, and owner tags.
 * `openapi-registration` validates the names after every module registers its tags.
 */
export const schemaTags = (...tags: string[]): string[] => tags;
