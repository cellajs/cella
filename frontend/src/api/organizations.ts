import { ApiError, organizationsClient as client } from '.';
export type CreateOrganizationParams = Parameters<(typeof client.organizations)['$post']>['0']['json'];

// Create a new organization
export const createOrganization = async (params: CreateOrganizationParams) => {
  const response = await client.organizations.$post({
    json: params,
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

export type UpdateOrganizationParams = Parameters<(typeof client.organizations)[':resourceIdentifier']['$put']>['0']['json'];

// Update an organization
export const updateOrganization = async (resourceIdentifier: string, params: UpdateOrganizationParams) => {
  const response = await client.organizations[':resourceIdentifier'].$put({
    param: { resourceIdentifier },
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
export const getOrganizationBySlugOrId = async (resourceIdentifier: string) => {
  const response = await client.organizations[':resourceIdentifier'].$get({
    param: { resourceIdentifier },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Delete organizations
export const deleteOrganizations = async (organizationIds: string[]) => {
  const response = await client.organizations.$delete({
    query: { ids: organizationIds },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};

export type GetMembersParams = Partial<
  Omit<Parameters<(typeof client.organizations)[':resourceIdentifier']['members']['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of members in an organization
export const getOrganizationMembers = async (
  resourceIdentifier: string,
  { q, sort = 'id', order = 'asc', role, page = 0, limit = 50 }: GetMembersParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.organizations[':resourceIdentifier'].members.$get(
    {
      param: { resourceIdentifier },
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

// INFO: Send newsletter to organizations (not implemented)
export const sendNewsletter = async ({
  organizationIds,
  subject,
  content,
}: {
  organizationIds: string[];
  subject: string;
  content: string;
}) => {
  console.info('Sending newsletter to organizations', organizationIds, subject, content);

  return { success: true };
};
