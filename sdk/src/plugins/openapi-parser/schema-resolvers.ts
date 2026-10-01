import type { GenSchema } from '../../docs-types';
import type { OpenApiSchema, OpenApiSpec } from './types';

function resolveRef(ref: string, spec: OpenApiSpec): { schema: OpenApiSchema | undefined; name: string } {
  // Refs take the form "#/components/schemas/User" or "#/components/responses/BadRequestError".
  const parts = ref.split('/');
  const name = parts[parts.length - 1];

  if (ref.startsWith('#/components/schemas/')) {
    return { schema: spec.components?.schemas?.[name], name };
  }
  if (ref.startsWith('#/components/responses/')) {
    const response = spec.components?.responses?.[name];
    if (!response || '$ref' in response) return { schema: undefined, name };
    const schema = response.content?.['application/json']?.schema;
    return { schema, name };
  }

  return { schema: undefined, name };
}

interface NullableReference {
  type: readonly string[];
  ref: string;
  targetDescription?: string;
}

/** Matches a schema whose only alternatives are a reference and null, inline or behind a named alias, so callers can collapse it to a nullable type. */
function matchNullableReference(schema: OpenApiSchema, spec: OpenApiSpec): NullableReference | undefined {
  if (schema.anyOf && schema.oneOf) return undefined;
  const alternatives = schema.anyOf ?? schema.oneOf;
  if (alternatives?.length !== 2) return undefined;

  const referenced = alternatives.find((candidate) => candidate.$ref);
  const nullable = alternatives.find((candidate) => candidate.type === 'null');
  if (!referenced?.$ref || !nullable || referenced === nullable) return undefined;

  const { schema: target } = resolveRef(referenced.$ref, spec);
  const targetType = target?.type ?? (target?.properties ? 'object' : undefined);
  if (!targetType) return undefined;

  const types = Array.isArray(targetType) ? targetType : [targetType];
  return {
    type: [...new Set([...types, 'null'])],
    ref: referenced.$ref,
    ...(target?.description && { targetDescription: target.description }),
  };
}

/** Later schemas override earlier properties, required arrays are combined, and the first $ref becomes extendsRef. */
function mergeAllOfSchemas(allOfSchemas: readonly OpenApiSchema[], spec: OpenApiSpec): { mergedSchema: OpenApiSchema; extendsRef?: string } {
  let extendsRef: string | undefined;
  const mergedProperties: Record<string, OpenApiSchema> = {};
  const mergedRequired: string[] = [];
  let mergedType: OpenApiSchema['type'];
  let mergedDescription: string | undefined;

  for (const subSchema of allOfSchemas) {
    let resolvedSubSchema = subSchema;

    if (subSchema.$ref) {
      if (!extendsRef) {
        extendsRef = subSchema.$ref;
      }
      const { schema: resolved } = resolveRef(subSchema.$ref, spec);
      if (resolved) {
        resolvedSubSchema = resolved;
      }
    }

    if (resolvedSubSchema.allOf) {
      const { mergedSchema: nestedMerged, extendsRef: nestedRef } = mergeAllOfSchemas(resolvedSubSchema.allOf, spec);
      resolvedSubSchema = nestedMerged;
      if (!extendsRef && nestedRef) {
        extendsRef = nestedRef;
      }
    }

    if (resolvedSubSchema.type) {
      mergedType = resolvedSubSchema.type;
    }

    if (resolvedSubSchema.description) {
      mergedDescription = resolvedSubSchema.description;
    }

    if (resolvedSubSchema.properties) {
      for (const [key, value] of Object.entries(resolvedSubSchema.properties)) {
        if (value === true) continue;
        mergedProperties[key] = value;
      }
    }

    if (resolvedSubSchema.required) {
      for (const req of resolvedSubSchema.required) {
        if (!mergedRequired.includes(req)) {
          mergedRequired.push(req);
        }
      }
    }
  }

  const mergedSchema: OpenApiSchema = {
    type: mergedType || 'object',
    properties: Object.keys(mergedProperties).length > 0 ? mergedProperties : undefined,
    required: mergedRequired.length > 0 ? mergedRequired : undefined,
    description: mergedDescription,
  };

  return { mergedSchema, extendsRef };
}

type ResolveOptions = {
  /** Nested nodes (properties, map values, array items) collapse nullable references; top-level nodes keep both alternatives so component schemas stay expanded. */
  nested: boolean;
  /** Inline required flag. Left out for top-level nodes and array items. */
  required?: boolean;
};

const numericConstraints = ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'] as const;

/** Copies the given keys onto `target` where `source` has them set. */
function copyDefined<K extends keyof GenSchema>(source: GenSchema, target: GenSchema, keys: readonly K[]) {
  for (const key of keys) {
    if (source[key] !== undefined) target[key] = source[key];
  }
}

/** Dereferences $refs, folds the required array into inline flags, and keeps reference metadata on the resolved node. */
function resolveNode(schema: OpenApiSchema, spec: OpenApiSpec, opts: ResolveOptions, visited: Set<string> = new Set()): GenSchema {
  const node = (type: GenSchema['type']): GenSchema => (opts.required === undefined ? { type } : { type, required: opts.required });

  if (schema.$ref) {
    if (visited.has(schema.$ref)) {
      return { ...node('object'), ref: schema.$ref, refDescription: '(circular reference)' };
    }

    const { schema: resolved } = resolveRef(schema.$ref, spec);
    if (!resolved) return { ...node('object'), ref: schema.$ref };

    const nullableAlias = opts.nested ? matchNullableReference(resolved, spec) : undefined;
    if (nullableAlias) {
      return { ...node(nullableAlias.type), ...(resolved.description && { description: resolved.description }), ref: schema.$ref };
    }

    const result = resolveNode(resolved, spec, opts, new Set(visited).add(schema.$ref));
    result.ref = schema.$ref;
    if (resolved.description && resolved.description !== result.description) {
      result.refDescription = resolved.description;
    }
    return result;
  }

  // Inline nullable reference: collapse to a nullable type, keeping the ref metadata.
  const nullableRef = opts.nested ? matchNullableReference(schema, spec) : undefined;
  if (nullableRef) {
    const result: GenSchema = { ...node(nullableRef.type), ref: nullableRef.ref };
    if (schema.description) result.description = schema.description;
    if (nullableRef.targetDescription && nullableRef.targetDescription !== schema.description) {
      result.refDescription = nullableRef.targetDescription;
    }
    return result;
  }

  if (schema.allOf) {
    const { mergedSchema, extendsRef } = mergeAllOfSchemas(schema.allOf, spec);
    const merged = resolveNode(mergedSchema, spec, opts, visited);
    if (extendsRef) merged.extendsRef = extendsRef;
    return merged;
  }

  const result = node(schema.type || 'object');

  // example is not copied: it belongs at the GenComponentSchema level only.
  if (schema.description) result.description = schema.description;
  if (schema.format) result.format = schema.format;
  if (schema.enum) result.enum = schema.enum as GenSchema['enum'];
  for (const key of numericConstraints) {
    if (schema[key] !== undefined) result[key] = schema[key];
  }

  if (schema.properties) {
    const requiredSet = new Set(schema.required ?? []);
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      if (value === true) continue;
      result.properties[key] = resolveNode(value, spec, { nested: true, required: requiredSet.has(key) }, visited);
    }
  }

  // additionalProperties carries record/map types from z.record().
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    result.additionalProperties = resolveNode(schema.additionalProperties, spec, { nested: true, required: false }, visited);
  }

  if (schema.items) {
    // Array items carry no required flag; their scalar facets lift onto the array node.
    const item = resolveNode(schema.items, spec, { nested: true }, visited);
    result.itemType = item.type;
    copyDefined(item, result, ['enum', 'format', 'ref', 'refDescription', 'minimum', 'maximum', 'minLength', 'maxLength']);
    if (item.properties || item.items || item.anyOf || item.oneOf) result.items = item;
  }

  for (const combinator of ['anyOf', 'oneOf'] as const) {
    const alternatives = schema[combinator];
    if (!alternatives) continue;
    const memberOpts: ResolveOptions = { nested: opts.nested, required: opts.nested ? false : undefined };
    result[combinator] = alternatives.map((alternative) => resolveNode(alternative, spec, memberOpts, visited));
    // type: 'object' describes only the container here, not the alternatives.
    if (result.type === 'object') delete result.type;
  }

  return result;
}

/** Resolves a top-level schema: a response body, a request body, or a component schema. */
export function resolveSchema(schema: OpenApiSchema, spec: OpenApiSpec): GenSchema {
  return resolveNode(schema, spec, { nested: false });
}

/** Resolves a parameter or property schema, with its required flag inline. */
export function resolveSchemaProperty(schema: OpenApiSchema, isRequired: boolean, spec: OpenApiSpec): GenSchema {
  return resolveNode(schema, spec, { nested: true, required: isRequired });
}
