import { config } from 'config';
import { labelsHc } from '#/modules/labels/hc';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = labelsHc(config.backendUrl, clientConfig);

export type CreateLabelParams = Parameters<(typeof client.index)['$post']>['0']['json'];

// Create a new label
export const createLabel = async (label: CreateLabelParams, orgIdOrSlug: string) => {
  const response = await client.index.$post({
    param: { orgIdOrSlug },
    json: label,
  });
  const json = await handleResponse(response);
  return json.success;
};

export type GetLabelsParams = Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
  page?: number;
  orgIdOrSlug: string;
};

// Get list of labels
export const getLabels = async (
  { q, sort = 'name', order = 'asc', page = 0, limit = 20, offset, projectId, orgIdOrSlug }: GetLabelsParams,
  signal?: AbortSignal,
) => {
  const response = await client.index.$get(
    {
      param: { orgIdOrSlug },
      query: {
        q,
        sort,
        order,
        projectId,
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

// Update label by its ID
export const updateLabel = async (id: string, orgIdOrSlug: string, useCount: number) => {
  const response = await client[':id'].$put({
    param: { id, orgIdOrSlug },
    json: {
      useCount,
    },
  });

  const json = await handleResponse(response);
  return json.success;
};

// Delete labels
export const deleteLabels = async (ids: string[], orgIdOrSlug: string) => {
  const response = await client.index.$delete({
    param: { orgIdOrSlug },
    query: { ids },
  });
  const json = await handleResponse(response);
  return json.success;
};
