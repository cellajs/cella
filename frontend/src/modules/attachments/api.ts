import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { attachmentsHc } from '#/modules/attachments/hc';

export const client = attachmentsHc(config.backendUrl, clientConfig);

export type CreateAttachmentParams = { attachments: Parameters<(typeof client.index)['$post']>['0']['json'] } & Parameters<
  (typeof client.index)['$post']
>['0']['param'];

/**
 * Create a new attachment
 *
 * @param attachments - An array of attachment data to create, where each attachment has:
 *   - `url`: URL of the attachment.
 *   - `filename`: Name of file.
 *   - `contentType`: MIME type of the attachment.
 *   - `size`: Size of file.
 *   - `organizationId`: Organization id to associate the attachment with.
 *   - `id`: An optional ID for the attachment (if not provided, a new ID will be generated).
 *
 * @param organizationId - Organization ID, used to check permissions and associate the attachment
 * @returns The created attachment data.
 */
export const createAttachment = async ({ attachments, orgIdOrSlug }: CreateAttachmentParams) => {
  const response = await client.index.$post({ param: { orgIdOrSlug }, json: attachments });
  const json = await handleResponse(response);
  return json.data;
};

export type GetAttachmentsParams = Omit<Parameters<(typeof client)['index']['$get']>['0']['query'], 'limit' | 'offset'> & {
  orgIdOrSlug: string;
  limit?: number;
  offset?: number;
  page?: number;
};

/**
 * Get a list of attachments with pagination and filters
 *
 * @param param.orgIdOrSlug - The organization ID or slug.
 * @param param.q - Optional search query to filter results.
 * @param param.sort - Field to sort by (defaults to 'id').
 * @param param.order - Sort order `'asc' | 'desc'` (defaults to 'asc').
 * @param param.page - Page number.
 * @param param.limit - Maximum number of attachments to fetch per page.
 * @param param.offset - Optional offset.
 * @param signal - Optional abort signal for cancelling the request.
 * @returns A paginated list of attachments.
 */
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

/**
 * Get a specific attachment by its ID
 *
 * @param id - The attachment ID.
 * @param orgIdOrSlug - The organization ID or slug.
 * @returns The attachment info
 */
export const getAttachment = async ({ orgIdOrSlug, id }: { orgIdOrSlug: string; id: string }) => {
  const response = await client[':id'].$get({ param: { orgIdOrSlug, id } });
  const json = await handleResponse(response);
  return json.data;
};

// Type definition for the parameters to update an attachment
export type UpdateAttachmentParams = Parameters<(typeof client)[':id']['$put']>['0']['json'] & {
  orgIdOrSlug: string;
  id: string;
};

/**
 * Update an attachment
 *
 * @param param.id - Attachment ID.
 * @param param.orgIdOrSlug - Organization ID or slug.
 * @param param.name - The updated attachment data.
 * @returns A boolean indicating success of the update
 */
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

/**
 * Delete multiple attachments
 *
 * @param param.id - Attachment ID.
 * @param param.orgIdOrSlug - Organization ID or slug.
 * @returns A boolean indicating whether the deletion was successful.
 */
export const deleteAttachments = async ({ orgIdOrSlug, ids }: DeleteAttachmentsParams) => {
  const response = await client.index.$delete({
    json: { ids },
    param: { orgIdOrSlug },
  });

  const json = await handleResponse(response);
  return json.success;
};
