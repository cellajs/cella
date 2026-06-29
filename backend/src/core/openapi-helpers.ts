/**
 * Helpers for authoring OpenAPI metadata.
 *
 * `schemaTags()` is the canonical way to set the `x-tags` extension on a
 * component schema. It accepts any combination of registered tag names —
 * typically one schema-kind tag (`data` / `base` / `errors`), optionally
 * followed by a module tag (e.g. `pages`) and an owner tag (`cella` /
 * `app`). Validation (every tag must exist in the registry) happens later
 * in `init-docs` once all module files have registered their tags.
 *
 * @example
 *   .openapi('Page', {
 *     description: 'A documentation page.',
 *     'x-tags': schemaTags('data', 'pages', 'cella'),
 *   });
 */
export const schemaTags = (...tags: string[]): string[] => tags;
