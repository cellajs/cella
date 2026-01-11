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
 * Recursively counts all search matches in a value (keys and primitive values).
 */
export const countSearchMatchesInValue = (value: unknown, searchText: string): number => {
  if (!searchText) return 0;
  const lowerSearch = searchText.toLowerCase();
  let count = 0;

  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    if (value.toLowerCase().includes(lowerSearch)) count++;
  } else if (typeof value === 'number') {
    if (String(value).includes(searchText)) count++;
  } else if (typeof value === 'boolean') {
    if (String(value).toLowerCase().includes(lowerSearch)) count++;
  } else if (Array.isArray(value)) {
    for (const item of value) {
      count += countSearchMatchesInValue(item, searchText);
    }
  } else if (typeof value === 'object') {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key.toLowerCase().includes(lowerSearch)) count++;
      count += countSearchMatchesInValue(val, searchText);
    }
  }

  return count;
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
 * Highlights all search matches in text with Tailwind classes.
 * Adds data-search-match attribute for scroll-to-match functionality.
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

  // Find all match indices
  const matches: number[] = [];
  let searchIndex = 0;
  while (true) {
    const index = lowerText.indexOf(lowerSearch, searchIndex);
    if (index === -1) break;
    matches.push(index);
    searchIndex = index + 1;
  }

  if (matches.length === 0) return <span className={colorClass}>{text}</span>;

  // Build segments with highlighted matches
  const segments: ReactNode[] = [];
  let lastEnd = 0;

  for (let i = 0; i < matches.length; i++) {
    const matchStart = matches[i];
    // Add text before match
    if (matchStart > lastEnd) {
      segments.push(text.slice(lastEnd, matchStart));
    }
    // Add highlighted match
    segments.push(
      <span key={i} className={searchMatchClass} data-search-match="true">
        {text.slice(matchStart, matchStart + searchText.length)}
      </span>,
    );
    lastEnd = matchStart + searchText.length;
  }

  // Add remaining text after last match
  if (lastEnd < text.length) {
    segments.push(text.slice(lastEnd));
  }

  return <span className={colorClass}>{segments}</span>;
};

/**
 * Finds the path to the Nth search match (0-indexed) in a JSON value.
 * Returns null if the match index is out of bounds.
 */
export const getPathToNthMatch = (
  value: unknown,
  searchText: string,
  targetIndex: number,
  currentPath: (string | number)[] = [],
): { path: (string | number)[]; currentCount: number } | null => {
  if (!searchText) return null;
  const lowerSearch = searchText.toLowerCase();
  let count = 0;

  const search = (val: unknown, path: (string | number)[]): { path: (string | number)[]; found: boolean } | null => {
    // Check primitive values
    if (val === null || val === undefined) return null;

    if (typeof val === 'string') {
      if (val.toLowerCase().includes(lowerSearch)) {
        if (count === targetIndex) return { path, found: true };
        count++;
      }
      return null;
    }

    if (typeof val === 'number') {
      if (String(val).includes(searchText)) {
        if (count === targetIndex) return { path, found: true };
        count++;
      }
      return null;
    }

    if (typeof val === 'boolean') {
      if (String(val).toLowerCase().includes(lowerSearch)) {
        if (count === targetIndex) return { path, found: true };
        count++;
      }
      return null;
    }

    // Check arrays
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        const result = search(val[i], [...path, i]);
        if (result?.found) return result;
      }
      return null;
    }

    // Check objects (including keys)
    if (typeof val === 'object') {
      for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
        // Check the key itself
        if (key.toLowerCase().includes(lowerSearch)) {
          if (count === targetIndex) return { path: [...path, key], found: true };
          count++;
        }
        // Check the value
        const result = search(v, [...path, key]);
        if (result?.found) return result;
      }
      return null;
    }

    return null;
  };

  const result = search(value, currentPath);
  return result ? { path: result.path, currentCount: count } : null;
};
