import { type Entity, config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { entitiesHc } from '#/modules/entities/hc';

export const client = entitiesHc(config.backendUrl, clientConfig);

/**
 * Check if a slug is available for a given entity type.
 *
 * @param params - Parameters to check slug availability.
 * @param params.slug - Slug to check.
 * @param params.type - Entity type for which the slug is being checked.
 * @returns A boolean indicating whether the slug is available.
 */
export const checkSlugAvailable = async (params: { slug: string; type: Entity }) => {
  const response = await client['check-slug'].$post({
    json: params,
  });

  const json = await handleResponse(response);
  return json.success;
};

export type EntitiesQuery = Parameters<(typeof client)['index']['$get']>['0']['query'];

/**
 * Get entities for a given query and optional entity type.
 *
 * @param query - Query parameters to get entities.
 * @param query.q -  Optional, search query.
 * @param query.type - Optional, type of entity to filter entities by.
 * @param query.entityId - Optional, excludes entities based on membership in the specified entity.
 * @returns An array of suggested entities based on the query.
 */
export const getEntities = async (query: EntitiesQuery) => {
  const response = await client.index.$get({ query });

  const json = await handleResponse(response);
  return json.data;
};
