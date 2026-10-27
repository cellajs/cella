import type { UserModel } from '#/modules/user/user-db';

type NameFields = Pick<UserModel, 'firstName' | 'lastName' | 'slug'>;

/**
 * The display name after an update, the same whoever edits the user: the first and last name merged over the stored
 * ones (a name left out keeps its value, null clears it), or the slug when neither is left.
 * @returns The new name; undefined when the update sets neither the first nor the last name, which keeps the stored one.
 */
export const nameAfterUpdate = (stored: NameFields, update: Partial<NameFields>): string | undefined => {
  if (update.firstName === undefined && update.lastName === undefined) return undefined;
  const { firstName = stored.firstName, lastName = stored.lastName, slug = stored.slug } = update;
  return [firstName, lastName].filter(Boolean).join(' ') || slug;
};
