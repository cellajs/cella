import { errorResponses, successWithDataSchema } from '#/utils/schema/common-responses';

import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated } from '#/middlewares/guard';

import { attachmentSchema, createAttachmentSchema } from './schema';

class AttachmentRoutesConfig {
  public createAttachment = createRouteConfig({
    method: 'post',
    path: '/',
    guard: isAuthenticated,
    tags: ['attachments'],
    summary: 'Create attachment',
    description: 'EXPERIMENTAL. Create a new attachment.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: createAttachmentSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Attachment',
        content: {
          'application/json': {
            schema: successWithDataSchema(attachmentSchema),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new AttachmentRoutesConfig();
