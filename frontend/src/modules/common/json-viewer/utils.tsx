import { foldText } from 'shared/utils/text-match';

export type JsonPath = (string | number)[];

const contains = (value: string | number | boolean, folded: string) => foldText(String(value)).includes(folded);

/**
 * Paths of the rows that show `searchText`, in render order: a row is one node, matching on its
 * key or its primitive value. The list counts the matches and drives next/previous; a collapsed
 * node counts the rows inside it.
 */
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
    if (typeof node === 'object') {
      if (keyMatches) paths.push(path);
      for (const [childKey, child] of Object.entries(node as Record<string, unknown>)) visit(child, [...path, childKey], childKey);
      return;
    }
    if (keyMatches || contains(node as string | number | boolean, folded)) paths.push(path);
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

/** Formats a display label such as "int", "float", "Array(5)", or "Object". */
export function getTypeLabel(value: unknown, type: string): string {
  switch (type) {
    case 'number': {
      const num = value as number;
      if (Number.isNaN(num)) return 'NaN';
      if (!Number.isFinite(num)) return 'Infinity';
      return Number.isInteger(num) ? 'int' : 'float';
    }
    case 'array':
      return `Array(${(value as unknown[]).length})`;
    case 'object':
      return 'Object';
    case 'string':
      return 'string';
    case 'boolean':
      return 'bool';
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    default:
      return type;
  }
}

export const jsonSchemaTypes = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);
