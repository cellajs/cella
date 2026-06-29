import slugify from 'slugify';

/**
 * Create slug from email
 *
 * @param email
 * @returns A slug based on the email address
 */
export const slugFromEmail = (email: string) => {
  const [alias] = email.split('@');
  return slugify(alias, { lower: true, strict: true });
};
