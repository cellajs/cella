import { isRecord } from 'shared/utils/as-record';
import { foldText } from 'shared/utils/text-match';

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
