/** Column length constraints, re-exported by `#/schemas` so Zod validation matches the DB. */
export const maxLength = {
  /** Max length for entity IDs, FKs, and ID-like references. */
  id: 50,
  /** Max length for standard text fields (name, email, slug, etc.). */
  field: 255,
  /** Max length for rich text / HTML content. */
  html: 1_000_000,
  /** Max length for URLs and storage keys. */
  url: 2048,
} as const;

/** Tenant ID uses a shorter nanoid. */
export const tenantIdLength = 24;
