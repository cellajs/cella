import { errorResponses, successWithDataSchema } from '#/lib/common-responses';

import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated } from '#/middlewares/guard';

import { attachmentSchema, createAttachmentSchema } from './schema';

class AttachmentRoutesConfig {
  public createAttachment = createRouteConfig({
    method: 'post',
    path: '/',
    // TODO: with guard it breaks. Investigate why
    guard: 'THIS IS BROKEN',
    tags: ['attachments'],
    summary: 'Create new attachment',
    description: 'Create a new attachment in a task.',
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
