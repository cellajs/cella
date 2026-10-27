/**
 * A non-negative integer read of one jsonb key, as SQL text with the key inlined, for contexts that reject parameters
 * such as `json_build_object`.
 */
export const jsonbIntRaw = (tableAndCol: string, key: string) => {
  const safeKey = key.replace(/'/g, "''");
  return `GREATEST(0, COALESCE((${tableAndCol}->>'${safeKey}')::int, 0))`;
};
