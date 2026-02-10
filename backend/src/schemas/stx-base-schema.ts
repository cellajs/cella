import { z } from '@hono/zod-openapi';

/**
 * Zod schema for StxBase (sync transaction base).
 */
export const stxBaseSchema = z
  .object({
    id: z.string(),
    sourceId: z.string(),
    version: z.number(),
    fieldVersions: z.record(z.string(), z.number()),
  })
  .openapi('StxBase', {
    example: {
      id: 'gen-abc123def456ghi789',
      sourceId: 'src_gen-xyz987wvu654',
      version: 1,
      fieldVersions: { name: 1, description: 1 },
    },
  });

export type StxBase = z.infer<typeof stxBaseSchema>;
