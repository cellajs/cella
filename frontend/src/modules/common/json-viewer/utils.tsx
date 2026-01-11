import type { ReactNode } from 'react';

/**
 * Recursively checks if a value or any of its children contain the search text.
 */
export const containsSearchMatch = (value: unknown, searchText: string): boolean => {
  if (!searchText) return false;
  const lowerSearch = searchText.toLowerCase();

  // Check primitive values
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.toLowerCase().includes(lowerSearch);
  if (typeof value === 'number') return String(value).includes(searchText);
  if (typeof value === 'boolean') return String(value).toLowerCase().includes(lowerSearch);

  // Check arrays
  if (Array.isArray(value)) {
    return value.some((item) => containsSearchMatch(item, searchText));
  }

  // Check objects (including keys)
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, val]) => key.toLowerCase().includes(lowerSearch) || containsSearchMatch(val, searchText),
    );
  }

  return false;
};

/**
 * Determines the type of a JSON value for display purposes.
 */
export function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Returns a formatted type label for display (e.g., "int", "float", "Array(5)", "Object").
 */
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

/** JSON Schema data type keywords */
export const JSON_SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);

/**
 * Highlights search matches in text with Tailwind classes.
 */
export const highlightText = (
  text: string,
  searchText: string,
  colorClass: string,
  searchMatchClass: string,
): ReactNode => {
  if (!searchText) return <span className={colorClass}>{text}</span>;

  const lowerText = text.toLowerCase();
  const lowerSearch = searchText.toLowerCase();
  const index = lowerText.indexOf(lowerSearch);

  if (index === -1) return <span className={colorClass}>{text}</span>;

  return (
    <span className={colorClass}>
      {text.slice(0, index)}
      <span className={searchMatchClass}>{text.slice(index, index + searchText.length)}</span>
      {text.slice(index + searchText.length)}
    </span>
  );
};
