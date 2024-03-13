import type { Member } from '~/types';
import { ApiError, client } from '.';

// Create a new organization
export const createOrganization = async (name: string) => {
  const response = await client.organizations.$post({
    json: { name },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

export type UpdateOrganizationParams = Parameters<(typeof client.organizations)[':organizationIdentifier']['$put']>['0']['json'];

// Update an organization
export const updateOrganization = async (organizationIdentifier: string, params: UpdateOrganizationParams) => {
  const response = await client.organizations[':organizationIdentifier'].$put({
    param: { organizationIdentifier },
    json: params,
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

export type GetOrganizationsParams = Partial<
  Omit<Parameters<(typeof client.organizations)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of organizations
export const getOrganizations = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = 50 }: GetOrganizationsParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.organizations.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: String(page * limit),
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

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Get an organization by its slug or ID
export const getOrganizationBySlugOrId = async (organizationIdentifier: string) => {
  const response = await client.organizations[':organizationIdentifier'].$get({
    param: { organizationIdentifier },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Update a user's role in an organization
export const updateUserInOrganization = async (organizationIdentifier: string, userId: string, role: Member['organizationRole']) => {
  const response = await client.organizations[':organizationIdentifier'].members[':userId'].$put({
    param: { organizationIdentifier, userId },
    json: { role },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Delete an organizations
export const deleteOrganizations = async (organizationIds: string[]) => {
  const response = await client.organizations.$delete({
    query: { ids: organizationIds },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};

export type GetMembersParams = Partial<
  Omit<Parameters<(typeof client.organizations)[':organizationIdentifier']['members']['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of members in an organization
export const getMembersByOrganizationIdentifier = async (
  organizationIdentifier: string,
  { q, sort = 'id', order = 'asc', role, page = 0, limit = 50 }: GetMembersParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.organizations[':organizationIdentifier'].members.$get(
    {
      param: {
        organizationIdentifier,
      },
      query: {
        q,
        sort,
        order,
        offset: String(page * limit),
        limit: String(limit),
        role,
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

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Remove members from an organization
export const removeMembersFromOrganization = async (organizationIdentifier: string, userIds: string[]) => {
  const response = await client.organizations[':organizationIdentifier'].members.$delete({
    param: { organizationIdentifier },
    query: { ids: userIds },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Send newsletter to organizations
export const sendNewsletter = async (organizationIds: string[], subject: string, content: string) => {
  console.info('Sending newsletter to organizations', organizationIds, subject, content);

  return { success: true };
};
