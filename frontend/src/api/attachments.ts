import { apiClient, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = apiClient.attachments;

type CreateAttachmentParams = Parameters<(typeof client)['$post']>['0']['json'];

// Create a new attachment
export const createAttachment = async (task: CreateAttachmentParams) => {
  const response = await client.$post({ json: task });
  const json = await handleResponse(response);
  return json.data;
};
