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

/**
 * A name for an address whose holder gave none: the part before the `@` without a `+tag`, split into words on `.`, `_`
 * and `-`, each capitalized ("jonas.peeters" gives "Jonas Peeters"). The part before the `@` as it is when it holds no word.
 */
export const displayNameFromEmail = (email: string) => {
  const [localPart] = email.split('@');
  const words = localPart
    .split('+')[0]
    .split(/[._-]+/)
    .filter(Boolean);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || localPart;
};
