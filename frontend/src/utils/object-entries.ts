export const objectEntries = <T extends Record<string, unknown>>(obj: T) => Object.entries(obj) as { [K in keyof T]: [K, T[K]] }[keyof T][];
