import slugify from 'slugify';

export const slugFromEmail = (email: string) => {
  const [alias] = email.split('@');
  return slugify(alias, { lower: true, strict: true });
};
