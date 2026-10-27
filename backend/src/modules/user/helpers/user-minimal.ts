import type { z } from 'zod';
import { userMinimalBaseSchema } from '#/schemas/minimal-base';
import { pick } from '#/utils/pick';

export type UserMinimalBase = z.infer<typeof userMinimalBaseSchema>;

type UserMinimalColumnKey = Exclude<keyof typeof userMinimalBaseSchema.shape, 'entityType'>;

/** The user columns of the minimal shape, every field but `entityType`, which is a literal. */
export const userMinimalColumnKeys = Object.keys(userMinimalBaseSchema.shape).filter((key): key is UserMinimalColumnKey => key !== 'entityType');

/** Picks the minimal fields, so a whole user row handed in leaves with no other column. */
export const toUserMinimalBase = (user: Pick<UserMinimalBase, UserMinimalColumnKey>): UserMinimalBase => ({
  ...pick(user, userMinimalColumnKeys),
  entityType: 'user',
});
