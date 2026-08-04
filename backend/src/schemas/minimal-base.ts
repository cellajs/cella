import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { mockOrganizationMinimalBase, mockUserMinimalBase } from './entity-base-mocks';

/**
 * Shape factory for minimal entity reference schemas: only the fields needed to render an
 * entity cell (avatar + name + link), discriminated by a literal `entityType` so generated
 * clients keep precise types per referenced entity.
 *
 * Kept in its own file so references (e.g. createdBy, updatedBy, tenant.organization) can be
 * imported without pulling in the full entity schemas (and their circular deps).
 */
const minimalBaseSchema = <T extends string>(entityType: T) =>
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    thumbnailUrl: z.string().nullable(),
    entityType: z.literal(entityType),
  });

/** Minimal user schema for references (e.g. createdBy, updatedBy). */
export const userMinimalBaseSchema = minimalBaseSchema('user').openapi('UserMinimalBase', {
  description: 'Minimal user data for references.',
  example: mockUserMinimalBase(),
  'x-tags': schemaTags('base', 'users', 'cella'),
});

/**
 * Nullable minimal-user reference. Unnamed so each use site emits an inline
 * `anyOf: [$ref, {type: 'null'}]`. Built as `z.union([..., z.null()])` because
 * zod-to-openapi emits a contradictory allOf for `.nullable()` refs.
 */
export const nullableUserMinimalBaseSchema = z.union([userMinimalBaseSchema, z.null()]);

/** Minimal organization schema for references (e.g. the single organization a tenant holds). */
export const organizationMinimalBaseSchema = minimalBaseSchema('organization').openapi('OrganizationMinimalBase', {
  description: 'Minimal organization data for references.',
  example: mockOrganizationMinimalBase(),
  'x-tags': schemaTags('base', 'organizations', 'cella'),
});

/** Nullable minimal-organization reference; unnamed for the same reason as the user variant. */
export const nullableOrganizationMinimalBaseSchema = z.union([organizationMinimalBaseSchema, z.null()]);
