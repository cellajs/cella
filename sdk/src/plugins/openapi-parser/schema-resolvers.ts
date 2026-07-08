import type { GenSchema, GenSchemaProperty } from '../../../../frontend/src/modules/docs/types';
import type { OpenApiSchema, OpenApiSpec } from './types';

/**
 * Resolves a $ref path to the actual schema from components
 */
function resolveRef(ref: string, spec: OpenApiSpec): { schema: OpenApiSchema | undefined; name: string } {
  // Handle refs like "#/components/schemas/User" or "#/components/responses/BadRequestError"
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

/**
 * Merges allOf schemas into a single flat schema.
 * Properties from later schemas override earlier ones.
 * Required arrays are combined.
 * The first $ref encountered is preserved as extendsRef for inheritance tracking.
 */
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

    // If it's a $ref, resolve it and track the first one as extendsRef
    if (subSchema.$ref) {
      if (!extendsRef) {
        extendsRef = subSchema.$ref;
      }
      const { schema: resolved } = resolveRef(subSchema.$ref, spec);
      if (resolved) {
        resolvedSubSchema = resolved;
      }
    }

    // Recursively handle nested allOf
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

    // Track the most specific type seen (falls back to 'object' below if none is set)
    if (resolvedSubSchema.type) {
      mergedType = resolvedSubSchema.type;
    }

    // Merge description (prefer later)
    if (resolvedSubSchema.description) {
      mergedDescription = resolvedSubSchema.description;
    }

    // Merge properties
    if (resolvedSubSchema.properties) {
      for (const [key, value] of Object.entries(resolvedSubSchema.properties)) {
        if (value === true) continue;
        mergedProperties[key] = value;
      }
    }

    // Merge required arrays
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

/**
 * Resolves an OpenAPI schema to a GenSchemaProperty, dereferencing $refs
 * and converting the required array to inline required fields.
 */
export function resolveSchemaProperty(
  schema: OpenApiSchema,
  isRequired: boolean,
  spec: OpenApiSpec,
  visited: Set<string> = new Set(),
): GenSchemaProperty {
  // Handle $ref
  if (schema.$ref) {
    // Prevent circular references
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
      const result = resolveSchemaProperty(resolved, isRequired, spec, newVisited);
      // Add ref metadata
      result.ref = schema.$ref;
      // Only add refDescription if the property doesn't already have the same description
      if (resolved.description && resolved.description !== result.description) {
        result.refDescription = resolved.description;
      }
      return result;
    }

    // Unresolved ref
    return {
      type: 'object',
      required: isRequired,
      ref: schema.$ref,
    };
  }

  const prop: GenSchemaProperty = {
    type: schema.type || 'object',
    required: isRequired,
  };

  // Copy description (example is NOT copied - it belongs at GenComponentSchema level only)
  if (schema.description) prop.description = schema.description;

  // Copy format constraints
  if (schema.format) prop.format = schema.format;
  if (schema.enum) prop.enum = schema.enum as readonly (string | number | boolean | null)[];
  if (schema.minimum !== undefined) prop.minimum = schema.minimum;
  if (schema.maximum !== undefined) prop.maximum = schema.maximum;
  if (schema.minLength !== undefined) prop.minLength = schema.minLength;
  if (schema.maxLength !== undefined) prop.maxLength = schema.maxLength;
  if (schema.minItems !== undefined) prop.minItems = schema.minItems;
  if (schema.maxItems !== undefined) prop.maxItems = schema.maxItems;

  // Handle nested object properties
  if (schema.properties) {
    const requiredSet = new Set(schema.required || []);
    prop.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      if (value === true) continue;
      prop.properties[key] = resolveSchemaProperty(value, requiredSet.has(key), spec, visited);
    }
  }

  // Handle additionalProperties (record/map types from z.record())
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    prop.additionalProperties = resolveSchemaProperty(schema.additionalProperties, false, spec, visited);
  }

  // Handle array items - unwrap simple items to parent level
  if (schema.items) {
    // Array items don't have a meaningful required field (present or absent, not optional),
    // so isRequired is always passed as false here.
    const resolvedItem = resolveSchemaProperty(schema.items, false, spec, visited);
    // Remove the redundant 'required' field from array items
    delete resolvedItem.required;
    // Check if item is "complex" (has nested properties or items)
    const isComplexItem = resolvedItem.properties || resolvedItem.items || resolvedItem.anyOf || resolvedItem.oneOf;

    // Always set itemType from the resolved item type
    prop.itemType = resolvedItem.type;

    // Unwrap simple item properties to parent (enum, format, ref, etc.)
    if (resolvedItem.enum) prop.enum = resolvedItem.enum;
    if (resolvedItem.format) prop.format = resolvedItem.format;
    if (resolvedItem.ref) prop.ref = resolvedItem.ref;
    if (resolvedItem.refDescription) prop.refDescription = resolvedItem.refDescription;
    if (resolvedItem.minimum !== undefined) prop.minimum = resolvedItem.minimum;
    if (resolvedItem.maximum !== undefined) prop.maximum = resolvedItem.maximum;
    if (resolvedItem.minLength !== undefined) prop.minLength = resolvedItem.minLength;
    if (resolvedItem.maxLength !== undefined) prop.maxLength = resolvedItem.maxLength;

    // Only keep full items for complex nested structures
    if (isComplexItem) {
      prop.items = resolvedItem;
    }
  }

  // Handle composition keywords
  if (schema.anyOf) {
    prop.anyOf = schema.anyOf.map((s: OpenApiSchema) => resolveSchemaProperty(s, false, spec, visited));
    // Remove type: 'object' when anyOf is present - it only describes the container, not the values
    if (prop.type === 'object') {
      delete prop.type;
    }
  }
  if (schema.oneOf) {
    prop.oneOf = schema.oneOf.map((s: OpenApiSchema) => resolveSchemaProperty(s, false, spec, visited));
    // Remove type: 'object' when oneOf is present - it only describes the container, not the values
    if (prop.type === 'object') {
      delete prop.type;
    }
  }
  // Handle allOf by merging into a flat schema
  if (schema.allOf) {
    const { mergedSchema, extendsRef } = mergeAllOfSchemas(schema.allOf, spec, visited);
    // Recursively resolve the merged schema
    const merged = resolveSchemaProperty(mergedSchema, isRequired, spec, visited);
    // Preserve inheritance info
    if (extendsRef) {
      merged.extendsRef = extendsRef;
    }
    return merged;
  }

  return prop;
}

/**
 * Resolves an OpenAPI schema to a top-level GenSchema for response bodies.
 * Preserves reference metadata when dereferencing.
 */
export function resolveSchema(schema: OpenApiSchema, spec: OpenApiSpec, visited: Set<string> = new Set()): GenSchema {
  // Handle $ref at top level
  if (schema.$ref) {
    // Prevent circular references
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
      // Preserve original ref info
      result.ref = schema.$ref;
      // Only add refDescription if the schema doesn't already have the same description
      if (resolved.description && resolved.description !== result.description) {
        result.refDescription = resolved.description;
      }
      return result;
    }

    // Unresolved ref
    return {
      type: 'object',
      ref: schema.$ref,
    };
  }

  const result: GenSchema = {
    type: schema.type || 'object',
  };

  // Don't copy description to refDescription here - that's only for $ref contexts.
  // Component schemas get their description at the GenComponentSchema level.

  // Handle enum
  if (schema.enum) {
    result.enum = schema.enum as readonly (string | number | boolean | null)[];
  }

  // Handle description and format constraints
  // example is NOT copied here - it's handled at the GenComponentSchema level in parse-spec.ts
  // to avoid duplication (schema.example vs schema.schema.example)
  if (schema.description) result.description = schema.description;
  if (schema.format) result.format = schema.format;
  if (schema.minimum !== undefined) result.minimum = schema.minimum;
  if (schema.maximum !== undefined) result.maximum = schema.maximum;
  if (schema.minLength !== undefined) result.minLength = schema.minLength;
  if (schema.maxLength !== undefined) result.maxLength = schema.maxLength;

  // Handle nested object properties
  if (schema.properties) {
    const requiredSet = new Set(schema.required || []);
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      if (value === true) continue;
      result.properties[key] = resolveSchemaProperty(value, requiredSet.has(key), spec, visited);
    }
  }

  // Handle additionalProperties (record/map types from z.record())
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    result.additionalProperties = resolveSchemaProperty(schema.additionalProperties, false, spec, visited);
  }

  // Handle array items - unwrap simple items to parent level
  if (schema.items) {
    const resolvedItem = resolveSchemaProperty(schema.items, true, spec, visited);
    // Check if item is "complex" (has nested properties or items)
    const isComplexItem = resolvedItem.properties || resolvedItem.items || resolvedItem.anyOf || resolvedItem.oneOf;

    // Always set itemType from the resolved item type
    result.itemType = resolvedItem.type;

    // Unwrap simple item properties to parent (enum, format, ref, etc.)
    if (resolvedItem.enum) result.enum = resolvedItem.enum;
    if (resolvedItem.ref) result.ref = resolvedItem.ref;
    if (resolvedItem.refDescription) result.refDescription = resolvedItem.refDescription;

    // Only keep full items for complex nested structures
    if (isComplexItem) {
      result.items = resolvedItem;
    }

    // Copy array constraints
    if (schema.minItems !== undefined) result.minItems = schema.minItems;
    if (schema.maxItems !== undefined) result.maxItems = schema.maxItems;
  }

  // Handle composition keywords
  if (schema.anyOf) {
    result.anyOf = schema.anyOf.map((s: OpenApiSchema) => resolveSchema(s, spec, visited));
    // Remove type: 'object' when anyOf is present - it only describes the container, not the values
    if (result.type === 'object') {
      delete result.type;
    }
  }
  if (schema.oneOf) {
    result.oneOf = schema.oneOf.map((s: OpenApiSchema) => resolveSchema(s, spec, visited));
    // Remove type: 'object' when oneOf is present - it only describes the container, not the values
    if (result.type === 'object') {
      delete result.type;
    }
  }
  // Handle allOf by merging into a flat schema
  if (schema.allOf) {
    const { mergedSchema, extendsRef } = mergeAllOfSchemas(schema.allOf, spec, visited);
    // Recursively resolve the merged schema
    const merged = resolveSchema(mergedSchema, spec, visited);
    // Preserve inheritance info
    if (extendsRef) {
      merged.extendsRef = extendsRef;
    }
    return merged;
  }

  return result;
}
