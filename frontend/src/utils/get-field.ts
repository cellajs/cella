// biome-ignore lint/suspicious/noExplicitAny: dynamic key access on objects with varying shapes
export const getField = (obj: any, key: string): unknown => obj?.[key];
