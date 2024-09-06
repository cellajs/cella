import { db } from '#/db/db';

import { attachmentsTable } from '#/db/schema/attachments';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import taskRoutesConfig from './routes';

const app = new CustomHono();

// Attachment endpoints
const attachmentsRoutes = app
  /*
   * Create attachment
   */
  .openapi(taskRoutesConfig.createAttachment, async (ctx) => {
    const newAttachment = ctx.req.valid('json');
    const user = ctx.get('user');
    const [createdAttachment] = await db
      .insert(attachmentsTable)
      .values({
        ...newAttachment,
        createdBy: user.id,
      })
      .returning();

    logEvent('Attachment created', { attachment: createdAttachment.id });

    return ctx.json({ success: true, data: createdAttachment }, 200);
  });

export type AppAttachmentsType = typeof attachmentsRoutes;

export default attachmentsRoutes;
