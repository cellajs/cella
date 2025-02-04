import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { attachmentsHc } from '#/modules/attachments/hc';

export const client = attachmentsHc(config.backendUrl, clientConfig);

type CreateAttachmentParams = Parameters<(typeof client.index)['$post']>['0']['json'];

// Create a new attachment
export const createAttachment = async ({
  attachments,
  organizationId,
}: {
  attachments: CreateAttachmentParams;
  organizationId: string;
}) => {
  const response = await client.index.$post({ param: { orgIdOrSlug: organizationId }, json: attachments });
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
  { orgIdOrSlug, q, sort = 'id', order = 'asc', page = 0, limit = config.requestLimits.attachments, offset }: GetAttachmentsParams,
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

export const getAttachment = async ({ orgIdOrSlug, id }: { orgIdOrSlug: string; id: string }) => {
  const response = await client[':id'].$get({ param: { orgIdOrSlug, id } });
  const json = await handleResponse(response);
  return json.data;
};

export type UpdateAttachmentParams = Parameters<(typeof client)[':id']['$put']>['0']['json'] & {
  orgIdOrSlug: string;
  id: string;
};

// Update an attachment
export const updateAttachment = async ({ orgIdOrSlug, id, ...params }: UpdateAttachmentParams) => {
  const response = await client[':id'].$put({
    param: { orgIdOrSlug, id },
    json: params,
  });

  const json = await handleResponse(response);
  return json.success;
};

export type DeleteAttachmentsParams = Parameters<(typeof client)['index']['$delete']>['0']['json'] & {
  orgIdOrSlug: string;
};

// Delete attachments
export const deleteAttachments = async ({ orgIdOrSlug, ids }: DeleteAttachmentsParams) => {
  const response = await client.index.$delete({
    json: { ids },
    param: { orgIdOrSlug },
  });

  const json = await handleResponse(response);
  return json.success;
};
