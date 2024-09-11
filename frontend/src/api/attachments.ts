// import type { AppAttachmentsType } from 'backend/modules/attachments/index';
// import { config } from 'config';
// import { hc } from 'hono/client';
// import { clientConfig, handleResponse } from '.';

// // Create Hono clients to make requests to the backend
// export const client = hc<AppAttachmentsType>(`${config.backendUrl}/attachments`, clientConfig);

// type CreateAttachmentParams = Parameters<(typeof client.index)['$post']>['0']['json'];

// // Create a new attachment
// export const createAttachment = async (task: CreateAttachmentParams) => {
//   const response = await client.index.$post({ json: task });
//   const json = await handleResponse(response);
//   return json.data;
// };
