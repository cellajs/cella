import { db } from '#/db/db';

import { config } from 'config';
import { type SQL, and, count, eq, ilike, inArray } from 'drizzle-orm';
import { html } from 'hono/html';
import { stream } from 'hono/streaming';
import { attachmentsTable } from '#/db/schema/attachments';
import { getContextUser, getMemberships, getOrganization } from '#/lib/context';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { CustomHono } from '#/types/common';
import { getOrderColumn } from '#/utils/order-column';
import { splitByAllowance } from '#/utils/split-by-allowance';
import attachmentsRoutesConfig from './routes';

const app = new CustomHono();

// Attachment endpoints
const attachmentsRoutes = app
  /*
   * Proxy to electric
   */
  .openapi(attachmentsRoutesConfig.shapeProxy, async (ctx) => {
    const url = new URL(ctx.req.url);

    // Constuct the upstream URL
    const originUrl = new URL(`${config.electricUrl}/v1/shape/attachments`);
    url.searchParams.forEach((value, key) => {
      originUrl.searchParams.set(key, value);
    });

    console.log('Proxying to:', originUrl.toString());

    // When proxying long-polling requests, content-encoding & content-length are added
    // erroneously (saying the body is gzipped when it's not) so we'll just remove
    // them to avoid content decoding errors in the browser.
    let res = await fetch(originUrl.toString());

    if (res.headers.get('content-encoding')) {
      const headers = new Headers(res.headers);
      console.log(
        'Removing content-encoding & content-length headers',
        headers.forEach((v, k) => console.log(k, v)),
      );
      headers.delete('content-encoding');
      headers.delete('content-length');
      res = new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    }
    return res;
  })
  /*
   * Create attachment
   */
  .openapi(attachmentsRoutesConfig.createAttachment, async (ctx) => {
    const newAttachment = ctx.req.valid('json');

    const organization = getOrganization();
    const user = getContextUser();

    // Get the name of the attachment without the extension
    const name = newAttachment.filename.split('.').slice(0, -1).join('.');

    const [createdAttachment] = await db
      .insert(attachmentsTable)
      .values({
        ...newAttachment,
        name,
        createdBy: user.id,
        organizationId: organization.id,
      })
      .returning();

    logEvent('Attachment created', { attachment: createdAttachment.id });

    return ctx.json({ success: true, data: createdAttachment }, 200);
  })
  /*
   * Get attachments
   */
  .openapi(attachmentsRoutesConfig.getAttachments, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');

    const organization = getOrganization();

    // Filter at least by valid organization
    const filters: SQL[] = [eq(attachmentsTable.organizationId, organization.id)];

    // TODO is this case sensitive? util for sanitizing?
    if (q) {
      const sanitizedQ = `%${q.trim()}%`;
      filters.push(ilike(attachmentsTable.filename, sanitizedQ));
    }

    const orderColumn = getOrderColumn(
      {
        id: attachmentsTable.id,
        filename: attachmentsTable.filename,
        contentType: attachmentsTable.contentType,
        createdAt: attachmentsTable.createdAt,
      },
      sort,
      attachmentsTable.id,
      order,
    );

    const attachmentsQuery = db
      .select()
      .from(attachmentsTable)
      .where(and(...filters))
      .orderBy(orderColumn);

    const attachments = await attachmentsQuery.offset(Number(offset)).limit(Number(limit));

    const [{ total }] = await db.select({ total: count() }).from(attachmentsQuery.as('attachments'));

    return ctx.json({ success: true, data: { items: attachments, total } }, 200);
  })
  /*
   * Get attachment
   */
  .openapi(attachmentsRoutesConfig.getAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const organization = getOrganization();

    const [attachment] = await db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.id, id), eq(attachmentsTable.organizationId, organization.id)));

    if (!attachment) return errorResponse(ctx, 404, 'not_found', 'warn', 'attachment');

    return ctx.json({ success: true, data: attachment }, 200);
  })
  /*
   * Update an organization by id or slug
   */
  .openapi(attachmentsRoutesConfig.updateAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const user = getContextUser();

    const updatedFields = ctx.req.valid('json');

    const [updatedAttachment] = await db
      .update(attachmentsTable)
      .set({
        ...updatedFields,
        modifiedAt: new Date(),
        modifiedBy: user.id,
      })
      .where(eq(attachmentsTable.id, id))
      .returning();

    logEvent('Attachment updated', { attachment: updatedAttachment.id });

    return ctx.json({ success: true, data: updatedAttachment }, 200);
  })
  /*
   * Delete attachments
   */
  .openapi(attachmentsRoutesConfig.deleteAttachments, async (ctx) => {
    const { ids } = ctx.req.valid('query');

    const memberships = getMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    if (!toDeleteIds.length) return errorResponse(ctx, 400, 'invalid_request', 'warn', 'attachment');

    const { allowedIds, disallowedIds } = await splitByAllowance('delete', 'attachment', toDeleteIds, memberships);

    // Map errors for disallowed ids
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'attachment', { attachment: id }));

    if (!allowedIds.length) return errorResponse(ctx, 403, 'forbidden', 'warn', 'attachment');

    // Delete the attachments
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, allowedIds));

    logEvent('Attachments deleted', { ids: allowedIds.join() });

    return ctx.json({ success: true, errors: errors }, 200);
  })
  .openapi(attachmentsRoutesConfig.getAttachmentCover, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const [attachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id));

    if (!attachment) return errorResponse(ctx, 404, 'not_found', 'warn', 'attachment');

    // let createdByUser: UserModel | undefined;

    // if (task.createdBy) {
    //   [createdByUser] = await db.select().from(usersTable).where(eq(usersTable.id, task.createdBy));
    // }

    // const coverStream = await generateCover({
    //   title: task.summary,
    //   avatarUrl: createdByUser?.thumbnailUrl || '',
    //   name: createdByUser?.name || '',
    //   position: createdByUser?.role || '',
    // });

    return stream(ctx, async (stream) => {
      // const coverStreamWeb = nodeStreamToWebStream(coverStream);
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      await stream.pipe({} as any);
    });
  })
  .openapi(attachmentsRoutesConfig.redirectToAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const [attachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id));
    if (!attachment) return errorResponse(ctx, 404, 'not_found', 'warn', 'attachment');

    const redirectUrl = `${config.frontendUrl}/${attachment.organizationId}/attachment/${id}`;

    // <title>${task.summary}</title>
    // <meta name="twitter:title" content="${task.summary}"/>
    // <meta property="og:title" content="${task.summary}"/>
    // <meta property="og:image" content="${config.backendUrl}/${task.organizationId}/tasks/${id}/cover"/>
    // <meta name="twitter:image" content="${config.backendUrl}/${task.organizationId}/tasks/${id}/cover"/>
    return ctx.html(html`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${attachment.filename}</title>
          <meta property="og:image" content="${config.frontendUrl}/static/images/thumbnail.png" />
          <meta name="twitter:image" content="${config.frontendUrl}/static/images/thumbnail.png" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:site" content="@Cella" />
          <meta name="twitter:creator" content="@Cella" />
          <meta property="og:url" content="${redirectUrl}" />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Cella" />
          <meta property="og:locale" content="en_US" />
          <meta name="robots" content="index,follow" />
        </head>
        <script>
          window.location.href = '${redirectUrl}';
        </script>
      </html>
    `);
  });

export default attachmentsRoutes;
