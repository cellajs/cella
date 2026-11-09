import type { UserModel } from '#/modules/user/user-db';

type NameFields = Pick<UserModel, 'givenName' | 'familyName' | 'slug'>;

/**
 * The display name after an update, the same whoever edits the user: the given and family name merged over the stored
 * ones (a name left out keeps its value, null clears it). The slug is the name whenever both names are empty, also when
 * the update changes the slug alone.
 * @returns The new name; undefined when the update keeps the stored one: it sets no name, and no slug for a user without names.
 */
export const nameAfterUpdate = (stored: NameFields, update: Partial<NameFields>): string | undefined => {
  if (update.givenName === undefined && update.familyName === undefined) return stored.givenName || stored.familyName ? undefined : update.slug;
  const { givenName = stored.givenName, familyName = stored.familyName, slug = stored.slug } = update;
  return [givenName, familyName].filter(Boolean).join(' ') || slug;
};
