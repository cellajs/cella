import { z } from 'zod';

/** A flag that only the string `true` turns on; unset, it reads as `fallback`. */
export function envFlag(fallback: 'true' | 'false') {
  return z
    .string()
    .default(fallback)
    .transform((value) => value === 'true');
}

/**
 * Validates a process's environment, an empty value counting as unset.
 * @throws An error naming every bad variable and why; a value never appears in it.
 */
export function parseEnv<T extends z.ZodType>(schema: T, source: Record<string, unknown>): z.output<T> {
  const result = schema.safeParse(Object.fromEntries(Object.entries(source).filter(([, value]) => value !== '')));
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
}
