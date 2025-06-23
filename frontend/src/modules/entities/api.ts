import { config, type EntityType } from 'config';
import { entitiesHc } from '#/modules/entities/hc';
import { clientConfig, handleResponse } from '~/lib/api';

export const client = entitiesHc(config.backendUrl, clientConfig);

/**
 * Check if a slug is available for a given entity type.
 *
 * @param params - Parameters to check slug availability.
 * @param params.slug - Slug to check.
 * @param params.type -EntityType type for which the slug is being checked.
 * @returns A boolean indicating whether the slug is available.
 */
export const checkSlugAvailable = async (params: { slug: string; type: EntityType }) => {
  const response = await client['check-slug'].$post({
    json: params,
  });

  const json = await handleResponse(response);
  return json.success;
};

export type PageEntitiesQuery = Parameters<(typeof client)['page']['$get']>['0']['query'];

/**
 * Get page entities for a given query and optional entity type.
 *
 * @param query - PageEntitiesQuery parameters to get page entities.
 * @returns An array of page entities based on query.
 */
export const getPageEntities = async (query: PageEntitiesQuery) => {
  const response = await client.page.$get({ query });

  const json = await handleResponse(response);
  return json.data;
};

export type ContextEntitiesQuery = Parameters<(typeof client)['context']['$get']>['0']['query'];

/**
 * Get context entities with membership & members for a given query with target user & context entity type.
 *
 * @param query - ContextEntitiesQuery parameters to get context entities with membership & members.
 * @returns An array of entities with membership & members based on query.
 */
export const getContextEntities = async (query: ContextEntitiesQuery) => {
  const response = await client.context.$get({ query });

  const json = await handleResponse(response);
  return json.data;
};
