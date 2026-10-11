import slugify from 'slugify';
import { maxLength } from '#/db/utils/constraints';

/** Room the random suffixes of `generateUniqueSlugs` may take, so a slug from the longest name still fits its column. */
const suffixRoom = 18;

/** The name in the characters a slug may hold; empty when the name has none of them, as a name in Chinese characters has. */
export const slugFromName = (name: string) =>
  slugify(name, { lower: true, strict: true })
    .slice(0, maxLength.field - suffixRoom)
    .replace(/-+$/, '');

/** The slug of an address: the part before the `@`. */
export const slugFromEmail = (email: string) => slugFromName(email.split('@')[0]);
