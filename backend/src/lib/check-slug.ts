import { config } from 'config';
import { checkSlugRoute } from '../modules/general/routes';

export const checkSlugExists = async (slug: string) => {
  const response = await fetch(`${config.backendUrl + checkSlugRoute.path.replace('{slug}', slug)}`, {
    method: checkSlugRoute.method,
  });

  const { data: slugExists } = (await response.json()) as { data: boolean };

  return slugExists;
};
