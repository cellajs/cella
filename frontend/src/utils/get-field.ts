// biome-ignore lint/suspicious/noExplicitAny: dynamic key access on objects with varying shapes
export function getField(obj: any, key: string): unknown {
  return obj?.[key];
}
