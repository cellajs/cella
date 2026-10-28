import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import { uploadTokenSchema } from '#/modules/me/me-schema';
import { booleanTransformSchema, validSlugSchema } from './common-schemas';
import { nullableUserMinimalBaseSchema, userMinimalBaseSchema } from './minimal-base';
import { streamChangeSchema } from './stream-schemas';
import { nullableStxBaseSchema, stxBaseSchema } from './sync-transaction-schemas';

const registry = new OpenAPIRegistry();
registry.register('UserMinimalBase', userMinimalBaseSchema);
registry.register('StxBase', stxBaseSchema);
registry.register(
  'ReusableUnionFixture',
  z.object({ user: nullableUserMinimalBaseSchema, stx: nullableStxBaseSchema, flag: booleanTransformSchema.optional() }),
);
registry.register('UploadToken', uploadTokenSchema);
registry.register('SlugFixture', z.object({ slug: validSlugSchema }));
registry.register('StreamChange', streamChangeSchema);

const schemas = new OpenApiGeneratorV31(registry.definitions).generateComponents().components?.schemas ?? {};

describe('OpenAPI composition conventions', () => {
  it('publishes a slug pattern that takes every slug the schema takes, so a client that checks the pattern refuses none', () => {
    // A pattern carries no flags: a case-insensitive regex publishes as its lower-case form, which the generated client enforces.
    const { pattern } = (schemas.SlugFixture as { properties: { slug: { pattern: string } } }).properties.slug;
    for (const slug of ['acme', 'Acme-Team', 'ACME2']) {
      expect(validSlugSchema.safeParse(slug).success, slug).toBe(true);
      expect(new RegExp(pattern).test(slug), slug).toBe(true);
    }
    expect(new RegExp(pattern).test('-acme')).toBe(false);
    expect(validSlugSchema.parse('Acme-Team')).toBe('acme-team');
  });

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
        properties: { user: nullableUserRef, stx: nullableStxRef },
      },
      StreamChange: { properties: { stx: nullableStxRef } },
    });

    // Nullable wrappers must not surface as named component schemas (SDK/docs export noise).
    expect(Object.keys(schemas).filter((name) => name.startsWith('Nullable'))).toEqual([]);
  });

  it('inlines the boolean query helper instead of exposing it as a component schema', () => {
    expect(schemas).toMatchObject({
      ReusableUnionFixture: {
        properties: { flag: { anyOf: [{ type: 'string', enum: ['true', 'false'] }, { type: 'boolean' }] } },
      },
    });
    expect(schemas).not.toHaveProperty('BooleanQueryValue');
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
