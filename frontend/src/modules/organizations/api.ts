import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { organizationsHc } from '#/modules/organizations/hc';

export const client = organizationsHc(config.backendUrl, clientConfig);

export type CreateOrganizationParams = Parameters<(typeof client.index)['$post']>['0']['json'];

/**
 * Create a new organization.
 *
 * @param params.name - Name of the organization.
 * @param params.slug - Slug for the organization, used in URLs and references.
 * @returns The created organization's data.
 */
export const createOrganization = async (params: CreateOrganizationParams) => {
  const response = await client.index.$post({
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Get an organization by slug or ID.
 *
 * @param idOrSlug - Target organization ID or slug.
 * @returns Data of the target organization.
 */
export const getOrganization = async (idOrSlug: string) => {
  const response = await client[':idOrSlug'].$get({
    param: { idOrSlug },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type GetOrganizationsParams = Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
  page?: number;
};

/**
 * Get a list of organizations with optional filters and pagination.
 *
 * @param param.q - Optional search query to filter results.
 * @param param.sort - Field to sort by (defaults to 'id').
 * @param param.order - Sort order `'asc' | 'desc'` (defaults to 'asc').
 * @param param.page - Page number.
 * @param param.limit - Maximum number of organizations per page (defaults to `config.requestLimits.organizations`).
 * @param param.offset - Optional offset.
 * @param signal - Optional abort signal for cancelling the request.
 * @returns The list of organizations matching the search query and filters.
 */
export const getOrganizations = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = config.requestLimits.organizations, offset }: GetOrganizationsParams,
  signal?: AbortSignal,
) => {
  const response = await client.index.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: typeof offset === 'number' ? String(offset) : String(page * limit),
        limit: String(limit),
      },
    },
    {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        return fetch(input, {
          ...init,
          credentials: 'include',
          signal,
        });
      },
    },
  );

  const json = await handleResponse(response);
  return json.data;
};

export type UpdateOrganizationBody = Parameters<(typeof client)[':idOrSlug']['$put']>['0']['json'];

/**
 * Update an organization's details.
 *
 * @param idOrSlug - Organization ID or slug.
 * @param json - The data to update the organization with name, slug, shortName, chatSupport, defaultLanguage, country, timezone, etc.
 * @returns The updated organization data.
 */
export const updateOrganization = async ({ idOrSlug, json }: { idOrSlug: string; json: UpdateOrganizationBody }) => {
  const response = await client[':idOrSlug'].$put({
    param: { idOrSlug },
    json,
  });

  const respJson = await handleResponse(response);
  return respJson.data;
};

/**
 * Delete multiple organizations by their IDs.
 *
 * @param ids - An array of organization IDs to delete.
 */
export const deleteOrganizations = async (ids: string[]) => {
  const response = await client.index.$delete({
    json: { ids },
  });

  await handleResponse(response);
};

export type NewsLetterBody = Parameters<(typeof client)['send-newsletter']['$post']>['0']['json'];

/**
 * Send a newsletter to organizations.
 *
 * @param body.content - Content of the newsletter.
 * @param body.organizationIds - An array of organization IDs to which the newsletter will be sent.
 * @param body.roles - An array specifying the roles  (`admin`, `member`) who will receive the newsletter.
 * @param body.subject - Subject of the newsletter.
 * @param toSelf - A flag to determine if the newsletter should be sent to the sender only.
 * @returns A boolean indicating whether the newsletter was successfully sent.
 */
export const sendNewsletter = async ({ body, toSelf = false }: { body: NewsLetterBody; toSelf: boolean }) => {
  const response = await client['send-newsletter'].$post({
    json: body,
    query: { toSelf },
  });

  const json = await handleResponse(response);
  return json.success;
};
