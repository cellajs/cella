import { config } from 'config';
import { checkSlugRouteConfig } from '../routes';

export const checkSlugExists = async (slug: string) => {
  const response = await fetch(`${config.backendUrl + checkSlugRouteConfig.route.path.replace('{slug}', slug)}`, {
    method: checkSlugRouteConfig.route.method,
  });

  const { data: slugExists } = (await response.json()) as { data: boolean };

  return slugExists;
};
