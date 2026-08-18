const isPrimitive = (v: unknown): boolean => v === null || typeof v !== 'object';

/** Primitive-only arrays and objects with at most 3 primitive values collapse to a single line; everything else stays multi-line. */
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

    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';

    if (entries.length <= 3 && entries.every(([, v]) => isPrimitive(v))) {
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
