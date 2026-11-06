import { hierarchy } from 'shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { toKebabCase } from '#/core/openapi-helpers';
import { normalizeOpenApiDocument } from '#/core/openapi-validation';

/** The singulars of the resources the app's own document annotates. */
const annotatedSingulars = async (): Promise<string[]> => {
  const { baseApp } = await import('#/routes');
  const doc = baseApp.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'resources', version: '0' } });
  normalizeOpenApiDocument(doc);
  return Object.values(doc.components?.schemas ?? {}).flatMap((schema) => {
    const resource: unknown = 'x-aep-resource' in schema ? schema['x-aep-resource'] : undefined;
    return resource && typeof resource === 'object' && 'singular' in resource ? [String(resource.singular)] : [];
  });
};

// AEP clients find an entity only through its annotation. An entity without one has no route at its id path
// (`…/tasks/{taskId}`) that answers with the component its name spells (`Task`).
describe('resource annotations', () => {
  let singulars: string[] = [];
  beforeAll(async () => {
    singulars = await annotatedSingulars();
  });

  it.each(hierarchy.allTypes)('annotates the %s entity as an AEP resource', (entityType) => {
    expect(singulars).toContain(toKebabCase(entityType));
  });
});
