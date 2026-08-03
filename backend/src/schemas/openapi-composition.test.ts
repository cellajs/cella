import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import { uploadTokenSchema } from '#/modules/me/me-schema';
import { booleanTransformSchema } from './common-schemas';
import { nullableUserMinimalBaseSchema, userMinimalBaseSchema } from './minimal-base';
import { streamNotificationSchema } from './stream-schemas';
import { nullableStxBaseSchema, stxBaseSchema } from './sync-transaction-schemas';

const registry = new OpenAPIRegistry();
registry.register('UserMinimalBase', userMinimalBaseSchema);
registry.register('StxBase', stxBaseSchema);
registry.register('BooleanQueryValue', booleanTransformSchema);
registry.register(
  'ReusableUnionFixture',
  z.object({
    user: nullableUserMinimalBaseSchema,
    stx: nullableStxBaseSchema,
    flag: booleanTransformSchema.optional(),
  }),
);
registry.register('UploadToken', uploadTokenSchema);
registry.register('StreamNotification', streamNotificationSchema);

const schemas = new OpenApiGeneratorV31(registry.definitions).generateComponents().components?.schemas ?? {};

describe('OpenAPI composition conventions', () => {
  it('inlines nullable references as anyOf [$ref, null] without extra component schemas', () => {
    // Guards against `.nullable()` on a registered schema, which emits a contradictory
    // allOf [$ref, {type: [x, 'null']}]. Unnamed z.union([ref, z.null()]) is the convention.
    const nullableUserRef = {
      anyOf: [{ $ref: '#/components/schemas/UserMinimalBase' }, { type: 'null' }],
    };
    const nullableStxRef = {
      anyOf: [{ $ref: '#/components/schemas/StxBase' }, { type: 'null' }],
    };
    expect(schemas).toMatchObject({
      ReusableUnionFixture: {
        properties: {
          user: nullableUserRef,
          stx: nullableStxRef,
          flag: { $ref: '#/components/schemas/BooleanQueryValue' },
        },
      },
      StreamNotification: {
        properties: {
          stx: nullableStxRef,
        },
      },
    });

    // Nullable wrappers must not surface as named component schemas (SDK/docs export noise).
    expect(Object.keys(schemas).filter((name) => name.startsWith('Nullable'))).toEqual([]);
  });

  it('references genuinely reusable unions by name', () => {
    expect(schemas).toMatchObject({
      BooleanQueryValue: {
        anyOf: [{ type: 'string', enum: ['true', 'false'] }, { type: 'boolean' }],
      },
    });
  });

  it('uses nullable type arrays for inline primitives and objects', () => {
    expect(schemas).toMatchObject({
      UploadToken: {
        properties: {
          params: { type: ['object', 'null'] },
        },
      },
    });
  });
});
