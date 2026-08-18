import type { GenSchema, GenSchemaProperty } from '../../../../frontend/src/modules/docs/types';
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
function mergeAllOfSchemas(
  allOfSchemas: readonly OpenApiSchema[],
  spec: OpenApiSpec,
  visited: Set<string>,
): { mergedSchema: OpenApiSchema; extendsRef?: string } {
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
      const { mergedSchema: nestedMerged, extendsRef: nestedRef } = mergeAllOfSchemas(
        resolvedSubSchema.allOf,
        spec,
        visited,
      );
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

/** Dereferences $refs and converts the required array into inline required fields. */
export function resolveSchemaProperty(
  schema: OpenApiSchema,
  isRequired: boolean,
  spec: OpenApiSpec,
  visited: Set<string> = new Set(),
): GenSchemaProperty {
  if (schema.$ref) {
    if (visited.has(schema.$ref)) {
      return {
        type: 'object',
        required: isRequired,
        ref: schema.$ref,
        refDescription: '(circular reference)',
      };
    }

    const newVisited = new Set(visited);
    newVisited.add(schema.$ref);

    const { schema: resolved } = resolveRef(schema.$ref, spec);
    if (resolved) {
      const nullableAlias = matchNullableReference(resolved, spec);
      if (nullableAlias) {
        return {
          type: nullableAlias.type,
          required: isRequired,
          ...(resolved.description && { description: resolved.description }),
          ref: schema.$ref,
        };
      }

      const result = resolveSchemaProperty(resolved, isRequired, spec, newVisited);
      result.ref = schema.$ref;
      if (resolved.description && resolved.description !== result.description) {
        result.refDescription = resolved.description;
      }
      return result;
    }

    return {
      type: 'object',
      required: isRequired,
      ref: schema.$ref,
    };
  }

  // Inline nullable reference: collapse to a nullable type, keeping the ref metadata.
  const nullableRef = matchNullableReference(schema, spec);
  if (nullableRef) {
    const prop: GenSchemaProperty = {
      type: nullableRef.type,
      required: isRequired,
      ref: nullableRef.ref,
    };
    if (schema.description) prop.description = schema.description;
    if (nullableRef.targetDescription && nullableRef.targetDescription !== schema.description) {
      prop.refDescription = nullableRef.targetDescription;
    }
    return prop;
  }

  const prop: GenSchemaProperty = {
    type: schema.type || 'object',
    required: isRequired,
  };

  // example is not copied: it belongs at the GenComponentSchema level only.
  if (schema.description) prop.description = schema.description;

  if (schema.format) prop.format = schema.format;
  if (schema.enum) prop.enum = schema.enum as readonly (string | number | boolean | null)[];
  if (schema.minimum !== undefined) prop.minimum = schema.minimum;
  if (schema.maximum !== undefined) prop.maximum = schema.maximum;
  if (schema.minLength !== undefined) prop.minLength = schema.minLength;
  if (schema.maxLength !== undefined) prop.maxLength = schema.maxLength;
  if (schema.minItems !== undefined) prop.minItems = schema.minItems;
  if (schema.maxItems !== undefined) prop.maxItems = schema.maxItems;

  if (schema.properties) {
    const requiredSet = new Set(schema.required || []);
    prop.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      if (value === true) continue;
      prop.properties[key] = resolveSchemaProperty(value, requiredSet.has(key), spec, visited);
    }
  }

  // additionalProperties carries record/map types from z.record().
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    prop.additionalProperties = resolveSchemaProperty(schema.additionalProperties, false, spec, visited);
  }

  if (schema.items) {
    // Array items carry no meaningful required field, so isRequired is always false here.
    const resolvedItem = resolveSchemaProperty(schema.items, false, spec, visited);
    delete resolvedItem.required;
    const isComplexItem = resolvedItem.properties || resolvedItem.items || resolvedItem.anyOf || resolvedItem.oneOf;

    prop.itemType = resolvedItem.type;

    if (resolvedItem.enum) prop.enum = resolvedItem.enum;
    if (resolvedItem.format) prop.format = resolvedItem.format;
    if (resolvedItem.ref) prop.ref = resolvedItem.ref;
    if (resolvedItem.refDescription) prop.refDescription = resolvedItem.refDescription;
    if (resolvedItem.minimum !== undefined) prop.minimum = resolvedItem.minimum;
    if (resolvedItem.maximum !== undefined) prop.maximum = resolvedItem.maximum;
    if (resolvedItem.minLength !== undefined) prop.minLength = resolvedItem.minLength;
    if (resolvedItem.maxLength !== undefined) prop.maxLength = resolvedItem.maxLength;

    if (isComplexItem) {
      prop.items = resolvedItem;
    }
  }

  if (schema.anyOf) {
    prop.anyOf = schema.anyOf.map((s: OpenApiSchema) => resolveSchemaProperty(s, false, spec, visited));
    // type: 'object' describes only the container here, not the values.
    if (prop.type === 'object') {
      delete prop.type;
    }
  }
  if (schema.oneOf) {
    prop.oneOf = schema.oneOf.map((s: OpenApiSchema) => resolveSchemaProperty(s, false, spec, visited));
    if (prop.type === 'object') {
      delete prop.type;
    }
  }
  if (schema.allOf) {
    const { mergedSchema, extendsRef } = mergeAllOfSchemas(schema.allOf, spec, visited);
    const merged = resolveSchemaProperty(mergedSchema, isRequired, spec, visited);
    if (extendsRef) {
      merged.extendsRef = extendsRef;
    }
    return merged;
  }

  return prop;
}

/** Resolves a top-level schema for response bodies, keeping reference metadata while dereferencing. */
export function resolveSchema(schema: OpenApiSchema, spec: OpenApiSpec, visited: Set<string> = new Set()): GenSchema {
  if (schema.$ref) {
    if (visited.has(schema.$ref)) {
      return {
        type: 'object',
        ref: schema.$ref,
        refDescription: '(circular reference)',
      };
    }

    const newVisited = new Set(visited);
    newVisited.add(schema.$ref);

    const { schema: resolved } = resolveRef(schema.$ref, spec);
    if (resolved) {
      const result = resolveSchema(resolved, spec, newVisited);
      result.ref = schema.$ref;
      if (resolved.description && resolved.description !== result.description) {
        result.refDescription = resolved.description;
      }
      return result;
    }

    return {
      type: 'object',
      ref: schema.$ref,
    };
  }

  const result: GenSchema = {
    type: schema.type || 'object',
  };

  // description is not copied to refDescription here: that applies only in $ref contexts.
  if (schema.enum) {
    result.enum = schema.enum as readonly (string | number | boolean | null)[];
  }

  if (schema.description) result.description = schema.description;
  if (schema.format) result.format = schema.format;
  if (schema.minimum !== undefined) result.minimum = schema.minimum;
  if (schema.maximum !== undefined) result.maximum = schema.maximum;
  if (schema.minLength !== undefined) result.minLength = schema.minLength;
  if (schema.maxLength !== undefined) result.maxLength = schema.maxLength;

  if (schema.properties) {
    const requiredSet = new Set(schema.required || []);
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      if (value === true) continue;
      result.properties[key] = resolveSchemaProperty(value, requiredSet.has(key), spec, visited);
    }
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    result.additionalProperties = resolveSchemaProperty(schema.additionalProperties, false, spec, visited);
  }

  if (schema.items) {
    const resolvedItem = resolveSchemaProperty(schema.items, true, spec, visited);
    const isComplexItem = resolvedItem.properties || resolvedItem.items || resolvedItem.anyOf || resolvedItem.oneOf;

    result.itemType = resolvedItem.type;

    if (resolvedItem.enum) result.enum = resolvedItem.enum;
    if (resolvedItem.ref) result.ref = resolvedItem.ref;
    if (resolvedItem.refDescription) result.refDescription = resolvedItem.refDescription;

    if (isComplexItem) {
      result.items = resolvedItem;
    }

    if (schema.minItems !== undefined) result.minItems = schema.minItems;
    if (schema.maxItems !== undefined) result.maxItems = schema.maxItems;
  }

  if (schema.anyOf) {
    result.anyOf = schema.anyOf.map((s: OpenApiSchema) => resolveSchema(s, spec, visited));
    if (result.type === 'object') {
      delete result.type;
    }
  }
  if (schema.oneOf) {
    result.oneOf = schema.oneOf.map((s: OpenApiSchema) => resolveSchema(s, spec, visited));
    if (result.type === 'object') {
      delete result.type;
    }
  }
  if (schema.allOf) {
    const { mergedSchema, extendsRef } = mergeAllOfSchemas(schema.allOf, spec, visited);
    const merged = resolveSchema(mergedSchema, spec, visited);
    if (extendsRef) {
      merged.extendsRef = extendsRef;
    }
    return merged;
  }

  return result;
}
