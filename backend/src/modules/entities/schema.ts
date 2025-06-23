import { membershipSummarySchema } from '#/modules/memberships/schema';
import { userSummarySchema } from '#/modules/users/schema';
import { contextEntityTypeSchema, idSchema, imageUrlSchema, nameSchema, pageEntityTypeSchema, slugSchema } from '#/utils/schema/common';
import { mapEntitiesToSchema } from '#/utils/schema/entities-to-schema';
import { z } from '@hono/zod-openapi';

export const entityBaseSchema = z.object({
  id: idSchema,
  entityType: contextEntityTypeSchema,
  slug: slugSchema,
  name: nameSchema,
  thumbnailUrl: imageUrlSchema.nullable().optional(),
  bannerUrl: imageUrlSchema.nullable().optional(),
});

const baseEntityQuerySchema = z.object({
  q: z.string().optional(),
  targetUserId: idSchema.optional(),
});

export const entityListItemSchema = entityBaseSchema.extend({
  email: z.string().optional(),
  entityType: pageEntityTypeSchema,
  membership: membershipSummarySchema.nullable(),
});

export const pageEntitiesSchema = z.object({
  items: z.array(entityListItemSchema),
  counts: mapEntitiesToSchema(() => z.number().optional()),
  total: z.number(),
});

export const pageEntitiesQuerySchema = baseEntityQuerySchema.extend({
  type: pageEntityTypeSchema.optional(),
  targetOrgId: idSchema.optional(),
  userMembershipType: contextEntityTypeSchema.optional(),
});

export const contextEntitiesSchema = z.array(
  entityBaseSchema.extend({
    createdAt: z.string(),
    membership: membershipSummarySchema,
    // TODO: better support might arrive for z.lazy in openapi 
    // @link https://github.com/asteasolutions/zod-to-openapi/issues/247#issuecomment-2985032121
    members: z.array(z.lazy(() => userSummarySchema)).openapi({
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'slug', 'name', 'email', 'entityType'],
        properties: {
          id: { type: 'string' },
          slug: { type: 'string' },
          name: { type: 'string' },
          thumbnailUrl: {
            type: ['string', 'null'],
            nullable: true,
          },
          bannerUrl: {
            type: ['string', 'null'],
            nullable: true,
          },
          email: {
            type: 'string',
            format: 'email',
          },
          entityType: {
            type: 'string',
            enum: ['user'],
          },
        },
      },
    })
  })
);

export const contextEntitiesQuerySchema = baseEntityQuerySchema.extend({
  roles: z.preprocess((val) => {
    if (typeof val === 'string') return [val]; // wrap single string as array
    if (Array.isArray(val)) return val;
    return undefined;
  }, z.array(membershipSummarySchema.shape.role).optional()),
  type: contextEntityTypeSchema,
  sort: z.enum(['name', 'createdAt']).default('createdAt').optional(),
});
