import { OpenAPIHono } from '@hono/zod-openapi';
import { type SQL, and, count, eq, ilike, inArray, or } from 'drizzle-orm';
import { html } from 'hono/html';
import { stream } from 'hono/streaming';

import { config } from 'config';
import { db } from '#/db/db';
import { attachmentsTable } from '#/db/schema/attachments';
import { type Env, getContextOrganization, getContextUser } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import defaultHook from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import attachmentsRouteConfig from './routes';

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

// Attachment endpoints
const attachmentsRoutes = app
  /*
   * Proxy to electric
   */
  .openapi(attachmentsRouteConfig.shapeProxy, async (ctx) => {
    const url = new URL(ctx.req.url);

    // Constuct the upstream URL
    const originUrl = new URL(`${config.electricUrl}/v1/shape?table=attachments`);

    // Copy over the relevant query params that the Electric client adds
    // so that we return the right part of the Shape log.
    url.searchParams.forEach((value, key) => {
      if (['live', 'handle', 'offset', 'cursor', 'where'].includes(key)) {
        originUrl.searchParams.set(key, value);
      }
    });

    // When proxying long-polling requests, content-encoding & content-length are added
    // erroneously (saying the body is gzipped when it's not) so we'll just remove
    // them to avoid content decoding errors in the browser.
    let res = await fetch(originUrl.toString());
    if (res.headers.get('content-encoding')) {
      const headers = new Headers(res.headers);
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
   * Create one or more attachments
   */
  .openapi(attachmentsRouteConfig.createAttachments, async (ctx) => {
    const newAttachments = ctx.req.valid('json');

    const organization = getContextOrganization();
    const user = getContextUser();

    const fixedNewAttachments = newAttachments.map((el) => ({
      ...el,
      name: el.filename.split('.').slice(0, -1).join('.'),
      createdBy: user.id,
      organizationId: organization.id,
    }));

    const createdAttachments = await db.insert(attachmentsTable).values(fixedNewAttachments).returning();

    logEvent(`${createdAttachments.length} attachments have been created`);

    return ctx.json({ success: true, data: createdAttachments }, 200);
  })
  /*
   * Get attachments
   */
  .openapi(attachmentsRouteConfig.getAttachments, async (ctx) => {
    const { q, sort, order, offset, limit } = ctx.req.valid('query');

    // Scope request to organization
    const organization = getContextOrganization();

    // Filter at least by valid organization
    const filters: SQL[] = [eq(attachmentsTable.organizationId, organization.id)];

    if (q) {
      const query = prepareStringForILikeFilter(q);
      filters.push(or(ilike(attachmentsTable.filename, query), ilike(attachmentsTable.name, query)) as SQL);
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
   * Get attachment by id
   */
  .openapi(attachmentsRouteConfig.getAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');

    // Scope the attachment to organization
    const organization = getContextOrganization();

    const [attachment] = await db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.id, id), eq(attachmentsTable.organizationId, organization.id)));

    if (!attachment) return errorResponse(ctx, 404, 'not_found', 'warn', 'attachment');

    return ctx.json({ success: true, data: attachment }, 200);
  })
  /*
   * Update an attachment by id
   */
  .openapi(attachmentsRouteConfig.updateAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');
    const user = getContextUser();

    const updatedFields = ctx.req.valid('json');

    const [updatedAttachment] = await db
      .update(attachmentsTable)
      .set({
        ...updatedFields,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
      })
      .where(eq(attachmentsTable.id, id))
      .returning();

    logEvent('Attachment updated', { attachment: updatedAttachment.id });

    return ctx.json({ success: true, data: updatedAttachment }, 200);
  })
  /*
   * Delete attachments by ids
   */
  .openapi(attachmentsRouteConfig.deleteAttachments, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    // const memberships = getContextMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];

    if (!toDeleteIds.length) return errorResponse(ctx, 400, 'invalid_request', 'warn', 'attachment');

    // TODO create in permission manager a method to check if the user can delete linked entities ?
    // Because for now it's use the same permission as for membership like if I can't delete organization then I can't delete attachment
    // const { allowedIds, disallowedIds } = await splitByAllowance('delete', 'attachment', toDeleteIds, memberships);

    // Map errors for disallowed ids
    // const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'attachment', { attachment: id }));

    // if (!allowedIds.length) return errorResponse(ctx, 403, 'forbidden', 'warn', 'attachment');

    // Delete the attachments
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, toDeleteIds));

    logEvent('Attachments deleted', { ids: toDeleteIds.join() });

    return ctx.json({ success: true, errors: [] }, 200);
  })
  .openapi(attachmentsRouteConfig.getAttachmentCover, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const [attachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id));

    if (!attachment) return errorResponse(ctx, 404, 'not_found', 'warn', 'attachment');

    // let createdByUser: UserModel | undefined;

    // if (task.createdBy) {
    //   createdByUser = await getUserBy('id', task.createdBy);
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
  .openapi(attachmentsRouteConfig.redirectToAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const [attachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id));
    if (!attachment) return errorResponse(ctx, 404, 'not_found', 'warn', 'attachment');

    const redirectUrl = `${config.frontendUrl}/${attachment.organizationId}/attachments?attachmentPreview=${attachment.url}`;

    return ctx.html(html`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${attachment.filename}</title>
          <meta property="og:image" content="${config.frontendUrl}/static/images/thumbnail.png" />
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
