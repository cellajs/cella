/**
 * Shared validator for the `[{ service: …, … }, …]` JSON arrays the deploy
 * workflow passes between tasks (enabled services, build matrix, rollout
 * plans). One implementation so every task rejects malformed input with the
 * same `--flag[i].field must be a string` shape.
 */
export function parseServiceRows<R extends string, O extends string = never>(
  raw: string,
  flag: string,
  fields: { required: readonly R[]; optional?: readonly O[] },
): Array<Record<R, string> & Partial<Record<O, string>>> {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error(`${flag} must be a JSON array`)
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`${flag}[${index}] must be an object`)
    const record = item as Record<string, unknown>
    const row: Record<string, string> = {}
    for (const field of fields.required) {
      const value = record[field]
      if (typeof value !== 'string') throw new Error(`${flag}[${index}].${field} must be a string`)
      row[field] = value
    }
    for (const field of fields.optional ?? []) {
      const value = record[field]
      if (value === undefined) continue
      if (typeof value !== 'string') throw new Error(`${flag}[${index}].${field} must be a string`)
      row[field] = value
    }
    return row as Record<R, string> & Partial<Record<O, string>>
  })
}
