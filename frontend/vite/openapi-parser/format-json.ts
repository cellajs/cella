/**
 * Custom JSON formatter that collapses simple arrays and objects to single lines.
 * Complex structures with nesting remain multi-line for readability.
 */

const isPrimitive = (v: unknown): boolean => v === null || typeof v !== 'object';

/**
 * Format JSON with collapsed primitive arrays and simple objects.
 * - Arrays with only primitives → single line: ["a", "b", "c"]
 * - Objects with ≤2 primitive values → single line: { "type": "string", "required": true }
 * - Everything else → multi-line with indentation
 */
export function formatJson(data: unknown, indent = 2): string {
  const spacer = ' '.repeat(indent);

  const stringify = (value: unknown, depth: number): string => {
    if (value === null) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      if (value.every(isPrimitive)) {
        return `[${value.map((v) => stringify(v, depth)).join(', ')}]`;
      }
      const items = value.map((v) => `${spacer.repeat(depth + 1)}${stringify(v, depth + 1)}`);
      return `[\n${items.join(',\n')}\n${spacer.repeat(depth)}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';

    // Collapse simple objects (≤2 keys, all primitive values)
    if (entries.length <= 2 && entries.every(([, v]) => isPrimitive(v))) {
      const props = entries.map(([k, v]) => `${JSON.stringify(k)}: ${stringify(v, depth)}`);
      return `{ ${props.join(', ')} }`;
    }

    const props = entries.map(
      ([k, v]) => `${spacer.repeat(depth + 1)}${JSON.stringify(k)}: ${stringify(v, depth + 1)}`,
    );
    return `{\n${props.join(',\n')}\n${spacer.repeat(depth)}}`;
  };

  return stringify(data, 0);
}
