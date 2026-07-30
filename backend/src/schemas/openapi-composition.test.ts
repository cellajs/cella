import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import { uploadTokenSchema } from '#/modules/me/me-schema';
import { booleanTransformSchema } from './common-schemas';
import { streamNotificationSchema } from './stream-schemas';
import { nullableStxBaseSchema, stxBaseSchema } from './sync-transaction-schemas';
import { nullableUserMinimalBaseSchema, userMinimalBaseSchema } from './user-minimal-base';

const registry = new OpenAPIRegistry();
registry.register('UserMinimalBase', userMinimalBaseSchema);
registry.register('NullableUserMinimalBase', nullableUserMinimalBaseSchema);
registry.register('StxBase', stxBaseSchema);
registry.register('NullableStxBase', nullableStxBaseSchema);
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
  it('references named reusable unions instead of expanding them at each use', () => {
    expect(schemas).toMatchObject({
      NullableUserMinimalBase: {
        anyOf: [{ $ref: '#/components/schemas/UserMinimalBase' }, { type: 'null' }],
      },
      NullableStxBase: {
        anyOf: [{ $ref: '#/components/schemas/StxBase' }, { type: 'null' }],
      },
      BooleanQueryValue: {
        anyOf: [{ type: 'string', enum: ['true', 'false'] }, { type: 'boolean' }],
      },
      ReusableUnionFixture: {
        properties: {
          user: { $ref: '#/components/schemas/NullableUserMinimalBase' },
          stx: { $ref: '#/components/schemas/NullableStxBase' },
          flag: { $ref: '#/components/schemas/BooleanQueryValue' },
        },
      },
      StreamNotification: {
        properties: {
          stx: { $ref: '#/components/schemas/NullableStxBase' },
        },
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
