import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { mockUserMinimalBase } from './entity-base-mocks';

/**
 * Only the fields needed to render an entity cell (avatar, name, link), discriminated by a literal
 * `entityType`. Its own file, so references can be imported without the full entity schemas.
 * Only the user reference is a named component, as many schemas point to it; a reference to another
 * entity stays unnamed and inlines where it is used.
 */
export const minimalBaseSchema = <T extends string>(entityType: T) =>
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    thumbnailUrl: z.string().nullable(),
    entityType: z.literal(entityType),
  });

/** Minimal user schema for references (e.g. createdBy, updatedBy). */
export const userMinimalBaseSchema = minimalBaseSchema('user').openapi('UserMinimalBase', {
  description: 'The smallest user shape: id, name, slug and avatar. Embedded wherever a row names a user, such as `createdBy` and `updatedBy`.',
  example: mockUserMinimalBase(),
  'x-tags': schemaTags('base', 'users', 'cella'),
});

/**
 * Unnamed, so each use site emits an inline `anyOf: [$ref, {type: 'null'}]`. Built as a union because
 * zod-to-openapi emits a contradictory allOf for `.nullable()` refs.
 */
export const nullableUserMinimalBaseSchema = z.union([userMinimalBaseSchema, z.null()]);
