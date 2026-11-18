import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { channelEntityTypeSchema } from '#/schemas/common-schemas';
import { mockUserMinimalBase } from '#/schemas/entity-base-mocks';
import { pick } from '#/utils/pick';

const minimalBaseFieldsSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  thumbnailUrl: z.string().nullable(),
});

const minimalBaseKeys = minimalBaseFieldsSchema.keyof().options;

type MinimalBaseKey = (typeof minimalBaseKeys)[number];

/**
 * Only the fields needed to render an entity cell (avatar, name, link), discriminated by a literal
 * `entityType`. Its own file, so references can be imported without the full entity schemas.
 * Only the user reference is a named component, as many schemas point to it; a reference to another
 * entity stays unnamed and inlines where it is used.
 */
export const minimalBaseSchema = <T extends string>(entityType: T) => minimalBaseFieldsSchema.extend({ entityType: z.literal(entityType) });

/** A minimal reference to a channel of any type. */
export const channelMinimalBaseSchema = minimalBaseFieldsSchema.extend({ entityType: channelEntityTypeSchema });

export type ChannelMinimalBase = z.infer<typeof channelMinimalBaseSchema>;

/** The minimal fields of a table or subquery, for a select; `entityType` is no column, {@link toMinimalBase} adds it. */
export const minimalBaseColumns = <T extends Record<MinimalBaseKey, unknown>>(columns: T) => pick(columns, minimalBaseKeys);

/** A minimal reference to an entity of `entityType`; a whole row handed in leaves with the minimal fields only. */
export const toMinimalBase = <T extends string>(entityType: T, row: z.infer<typeof minimalBaseFieldsSchema>) => ({
  ...pick(row, minimalBaseKeys),
  entityType,
});

/** Minimal user schema for references: a member list, a notification's actor. */
export const userMinimalBaseSchema = minimalBaseSchema('user').openapi('UserMinimalBase', {
  description:
    'The smallest user shape: id, name, slug and avatar. Embedded wherever a response names a user: a member list, the actor of a notification. A row names its writers as `ActorRef`.',
  example: mockUserMinimalBase(),
  'x-tags': schemaTags('embedded', 'users', 'cella'),
});

export type UserMinimalBase = z.infer<typeof userMinimalBaseSchema>;

/**
 * Unnamed, so each use site emits an inline `anyOf: [$ref, {type: 'null'}]`. Built as a union because
 * zod-to-openapi emits a contradictory allOf for `.nullable()` refs.
 */
export const nullableUserMinimalBaseSchema = z.union([userMinimalBaseSchema, z.null()]);
