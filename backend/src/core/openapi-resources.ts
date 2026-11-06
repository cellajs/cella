import { config } from 'shared/config/config.default';
import { toKebabCase } from '#/core/openapi-helpers';
import type { OpenApiDocument } from '#/core/openapi-validation';

/** A path variable that holds a resource id: the resource's singular in camelCase, then `Id`. */
const idVariable = /^\{([a-z][a-zA-Z0-9]*)Id\}$/;

const collectionSegment = /^[a-z][a-z0-9-]*$/;

/** A custom method addresses the resource of the path before its `:verb`. */
const customMethodSuffix = /:[a-z][a-z0-9-]*$/;

/** A resource path without its leading slash, and the names it gives the resource it ends in. */
type ResourcePath = { pattern: string; singular: string; plural: string; parent?: string };

/** The resource a path addresses when it alternates collections and id variables and ends in a variable; else undefined. */
const resourcePathOf = (path: string): ResourcePath | undefined => {
  const segments = path.replace(customMethodSuffix, '').split('/').slice(1);
  if (segments.length === 0 || segments.length % 2 !== 0) return undefined;
  const singulars: string[] = [];
  for (let index = 0; index < segments.length; index += 2) {
    const id = idVariable.exec(segments[index + 1]);
    if (!id || !collectionSegment.test(segments[index])) return undefined;
    singulars.push(toKebabCase(id[1]));
  }
  return { pattern: segments.join('/'), singular: singulars[singulars.length - 1], plural: segments[segments.length - 2], parent: singulars.at(-2) };
};

type OperationNode = { responses?: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }> };

/** The component schemas an operation's success responses are, by name. */
const successSchemaNames = (operation: OperationNode): string[] =>
  Object.entries(operation.responses ?? {}).flatMap(([status, response]) => {
    const name = status.startsWith('2') ? response.content?.['application/json']?.schema?.$ref?.split('/').pop() : undefined;
    return name ? [name] : [];
  });

/**
 * Annotates as an AEP resource (`x-aep-resource`, AEP-4) each component schema an operation on a resource path answers
 * with, when the component's name spells the singular of the path's last id variable (`ServiceAccount` for
 * `{serviceAccountId}`). The names, parents and patterns come from those paths, so an app's own resources get it too.
 * The type reads the default config's slug: a mode's slug carries its mode, and a resource keeps one type in every mode.
 */
export const documentResources = (doc: OpenApiDocument) => {
  const found = new Map<string, { singular: string; plural: string; parents: Set<string>; patterns: Set<string> }>();
  for (const [path, item] of Object.entries((doc.paths ?? {}) as Record<string, Record<string, OperationNode>>)) {
    const resourcePath = resourcePathOf(path);
    if (!resourcePath) continue;
    const { pattern, singular, plural, parent } = resourcePath;
    for (const name of Object.values(item).flatMap(successSchemaNames)) {
      if (toKebabCase(name) !== singular) continue;
      const resource = found.get(name) ?? { singular, plural, parents: new Set<string>(), patterns: new Set<string>() };
      if (parent) resource.parents.add(parent);
      resource.patterns.add(pattern);
      found.set(name, resource);
    }
  }

  const schemas = doc.components?.schemas ?? {};
  for (const [name, { singular, plural, parents, patterns }] of found) {
    const schema = schemas[name];
    if (!schema || typeof schema !== 'object') continue;
    Object.assign(schema, {
      'x-aep-resource': {
        type: `${config.slug}/${singular}`,
        singular,
        plural,
        ...(parents.size > 0 && { parents: [...parents] }),
        patterns: [...patterns],
      },
    });
  }
};
