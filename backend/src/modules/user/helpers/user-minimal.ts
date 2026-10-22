import type { z } from 'zod';
import type { userMinimalBaseSchema } from '#/schemas/minimal-base';
import { pick } from '#/utils/pick';

export type UserMinimalBase = z.infer<typeof userMinimalBaseSchema>;

// Minimal-user columns minus entityType (added as a literal); derived so this tracks userMinimalBaseSchema.
type UserMinimalColumnKey = Exclude<keyof typeof userMinimalBaseSchema.shape, 'entityType'>;
const selectKeys = ['id', 'name', 'slug', 'thumbnailUrl'] satisfies UserMinimalColumnKey[];

/** Picks the minimal fields, so a whole user row handed in leaves with no other column. */
export const toUserMinimalBase = (user: Pick<UserMinimalBase, UserMinimalColumnKey>): UserMinimalBase => ({
  ...pick(user, selectKeys),
  entityType: 'user',
});
