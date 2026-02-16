/**
 * Column length constraints used in both Drizzle DB schemas and Zod validation.
 * Single source of truth: defined here at the DB level, re-exported by #/schemas for API validation.
 */
export const maxLength = {
  /** Max length for password input (not stored — passwords are hashed) */
  password: 100,
  /** Max length for entity IDs, FKs, and ID-like references */
  id: 50,
  /** Max length for standard text fields (name, email, slug, etc.) */
  field: 255,
  /** Max length for rich text / HTML content */
  html: 100_000,
  /** Max length for URLs and storage keys */
  url: 2048,
} as const;

/** Tenant ID uses a shorter nanoid */
export const tenantIdLength = 24;
