import { config } from 'config';
import { attachmentsHc } from '#/modules/attachments/hc';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = attachmentsHc(config.backendUrl, clientConfig);

type CreateAttachmentParams = Parameters<(typeof client.index)['$post']>['0']['json'];

// Create a new attachment
export const createAttachment = async (task: CreateAttachmentParams) => {
  const response = await client.index.$post({ json: task });
  const json = await handleResponse(response);
  return json.data;
};

export type GetAttachmentsParams = Omit<Parameters<(typeof client)['index']['$get']>['0']['query'], 'limit' | 'offset'> & {
  orgIdOrSlug: string;
  limit?: number;
  offset?: number;
  page?: number;
};

// Get a list of attachments
export const getAttachments = async (
  { orgIdOrSlug, q, sort = 'id', order = 'asc', page = 0, limit = 50, offset }: GetAttachmentsParams,
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
      param: { orgIdOrSlug },
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

export type DeleteAttachmentsParams = Parameters<(typeof client)['index']['$delete']>['0']['query'] & {
  orgIdOrSlug: string;
};

// Delete attachments
export const deleteAttachments = async ({ orgIdOrSlug, ids }: DeleteAttachmentsParams) => {
  const response = await client.index.$delete({
    query: { ids },
    param: { orgIdOrSlug },
  });

  const json = await handleResponse(response);
  return json.success;
};
