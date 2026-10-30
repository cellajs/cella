import { isRecord } from 'shared/utils/as-record';
import { foldText } from 'shared/utils/text-match';
import type { SchemaConstraints, SchemaLabelsProps } from '~/modules/common/json-viewer/schema-labels';
import type { JsonViewerProps } from '~/modules/common/json-viewer/types';

export type JsonPath = (string | number)[];

/** Whether `path` is `target` or leads to it. */
export const isPathPrefix = (path: JsonPath, target: JsonPath | null) =>
  !!target?.length && path.length <= target.length && path.every((segment, index) => String(segment) === String(target[index]));

const contains = (value: unknown, folded: string) => foldText(String(value)).includes(folded);

/** Paths of the rows that show `searchText`, in render order; a row is one node, matched on its key or its primitive value. */
export const matchRowPaths = (value: unknown, searchText: string): JsonPath[] => {
  if (!searchText) return [];
  const folded = foldText(searchText);
  const paths: JsonPath[] = [];

  const visit = (node: unknown, path: JsonPath, key: string | null) => {
    const keyMatches = key !== null && contains(key, folded);
    if (node === null || node === undefined) {
      if (keyMatches) paths.push(path);
      return;
    }
    if (Array.isArray(node)) {
      if (keyMatches) paths.push(path);
      for (const [index, item] of node.entries()) visit(item, [...path, index], null);
      return;
    }
    if (isRecord(node)) {
      if (keyMatches) paths.push(path);
      for (const [childKey, child] of Object.entries(node)) visit(child, [...path, childKey], childKey);
      return;
    }
    if (keyMatches || contains(node, folded)) paths.push(path);
  };

  visit(value, [], null);
  return paths;
};

export function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export const jsonSchemaTypes = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);

// Schema keywords that render as labels or inline constraints, so their own entries are hidden
const labelKeys = new Set<string | number>([
  'required',
  'maxLength',
  'minLength',
  'maximum',
  'minimum',
  'type',
  'ref',
  'contentType',
  'additionalProperties',
]);

interface NodeDescription {
  labels: SchemaLabelsProps;
  entries: [string | number, unknown][];
  /** The children a reader sees, for the collapsed preview. */
  schemaPropertiesCount: number;
  /** Schema mode: an object is expandable only if it has nested object (not array) children; arrays are always expandable. */
  isExpandable: boolean;
  /** A schema-mode array of primitives, rendered inline. */
  isPrimitiveArray: boolean;
}

/** A description keyword. Always a string, so a parameter or property named `description`, which holds a schema, never matches. */
const isDescriptionKeyword = (key: string | number, value: unknown) =>
  (key === 'description' || key === 'refDescription') && typeof value === 'string';

/** Whether a schema holds a description keyword at any depth. */
export function hasDescriptionKeyword(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDescriptionKeyword);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => isDescriptionKeyword(key, child) || hasDescriptionKeyword(child));
}

/** What an object or array node renders. In schema mode its keywords become labels and an array schema's item properties are hoisted. */
export function describeNode(
  value: Record<string, unknown> | unknown[],
  openapiMode: JsonViewerProps['openapiMode'],
  isPropertiesNode: boolean,
  hideDescriptions: boolean,
): NodeDescription {
  const isArray = Array.isArray(value);
  const schemaRecord = openapiMode === 'schema' && isRecord(value) ? value : null;

  // A 'properties' node's keys are property names, so none of them is read or hidden as a schema keyword.
  const keywords = isPropertiesNode ? null : schemaRecord;

  // 'type' renders as a label: a string, or an array such as ["string", "null"] for nullable.
  const typeValue = (() => {
    const typeField = keywords?.type;
    if (typeof typeField === 'string') return typeField;
    if (Array.isArray(typeField) && typeField.every((type): type is string => typeof type === 'string')) return typeField;
    return null;
  })();

  // anyOf/oneOf render as a type label.
  const hasAnyOf = Array.isArray(keywords?.anyOf);
  const hasOneOf = Array.isArray(keywords?.oneOf);

  // 'ref' renders as a label holding only the schema name: '#/components/schemas/User' becomes 'User'.
  const refField = keywords?.ref;
  const refValue = typeof refField === 'string' ? refField.split('/').pop() || refField : null;

  // Rendered as a label and filtered out of the entries below.
  const contentTypeField = keywords?.contentType;
  const contentTypeValue = typeof contentTypeField === 'string' ? contentTypeField : null;

  // Rendered inline and filtered out of the entries below.
  const constraints = (() => {
    if (!schemaRecord) return null;
    const found: SchemaConstraints = {};
    if (typeof schemaRecord.maxLength === 'number') found.maxLength = schemaRecord.maxLength;
    if (typeof schemaRecord.minLength === 'number') found.minLength = schemaRecord.minLength;
    if (typeof schemaRecord.maximum === 'number') found.maximum = schemaRecord.maximum;
    if (typeof schemaRecord.minimum === 'number') found.minimum = schemaRecord.minimum;
    return Object.keys(found).length > 0 ? found : null;
  })();

  // Rendered as a synthetic [key] entry.
  const additionalProperties = keywords?.additionalProperties;
  const additionalPropertiesSchema = additionalProperties && typeof additionalProperties === 'object' ? additionalProperties : null;

  const isArraySchema = schemaRecord?.type === 'array';

  const rawEntries: [string | number, unknown][] = isArray ? value.map((item, index) => [index, item]) : Object.entries(value);

  // Hide schema keys promoted into labels and hoist array-item properties.
  const filteredEntries =
    openapiMode === 'schema' && !isArray
      ? rawEntries.filter(
          ([key, child]) =>
            (isPropertiesNode || !labelKeys.has(key)) &&
            !(isArraySchema && key === 'items') &&
            !(hideDescriptions && isDescriptionKeyword(key, child)),
        )
      : rawEntries;

  const items = schemaRecord?.items;
  const hoistedItemsEntries = isArraySchema && isRecord(items) && isRecord(items.properties) ? Object.entries(items.properties) : [];

  // Primitives sort before objects and arrays.
  const entries =
    openapiMode === 'schema' && !isArray
      ? [...filteredEntries, ...hoistedItemsEntries].sort(([, a], [, b]) => {
          const aIsObject = a !== null && typeof a === 'object';
          const bIsObject = b !== null && typeof b === 'object';
          if (aIsObject === bIsObject) return 0;
          return aIsObject ? 1 : -1;
        })
      : filteredEntries;

  if (additionalPropertiesSchema) entries.push(['[key]', additionalPropertiesSchema]);

  const schemaPropertiesCount = (() => {
    if (isArraySchema) return hoistedItemsEntries.length;
    const properties = schemaRecord?.properties;
    return properties && typeof properties === 'object' ? Object.keys(properties).length : entries.length;
  })();

  return {
    labels: { typeValue, refValue, contentTypeValue, hasAnyOf, hasOneOf, constraints },
    entries,
    schemaPropertiesCount,
    isExpandable: openapiMode === 'schema' && !isArray ? entries.some(([, child]) => isRecord(child)) : true,
    isPrimitiveArray:
      isArray && openapiMode === 'schema' && value.every((item) => item === null || (typeof item !== 'object' && typeof item !== 'undefined')),
  };
}
