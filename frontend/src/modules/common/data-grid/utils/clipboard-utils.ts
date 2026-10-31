/** Cell value to clipboard string: objects use their `name` field, everything else `String(value)`. */
export function cellValueToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const name = (value as { name?: unknown }).name;
    return name != null ? String(name) : '';
  }
  return String(value);
}
