import type { UserModel } from '#/modules/user/user-db';

type NameFields = Pick<UserModel, 'givenName' | 'familyName' | 'slug'>;

/**
 * The display name after an update, the same whoever edits the user: the given and family name merged over the stored
 * ones (a name left out keeps its value, null clears it), or the slug when neither is left.
 * @returns The new name; undefined when the update sets neither the given nor the family name, which keeps the stored one.
 */
export const nameAfterUpdate = (stored: NameFields, update: Partial<NameFields>): string | undefined => {
  if (update.givenName === undefined && update.familyName === undefined) return undefined;
  const { givenName = stored.givenName, familyName = stored.familyName, slug = stored.slug } = update;
  return [givenName, familyName].filter(Boolean).join(' ') || slug;
};
