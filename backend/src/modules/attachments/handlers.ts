import { db } from '#/db/db';
import { attachmentsTable } from '#/db/schema/attachments';
import { env } from '#/env';
import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { type ErrorType, createError, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { enrichAttachmentWithUrls, enrichAttachmentsWithUrls } from '#/modules/attachments/helpers/convert-attachments';
import attachmentRoutes from '#/modules/attachments/routes';
import { splitByAllowance } from '#/permissions/split-by-allowance';
import defaultHook from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

import { OpenAPIHono } from '@hono/zod-openapi';
import { config } from 'config';
import { type SQL, and, count, eq, ilike, inArray, like, notLike, or } from 'drizzle-orm';
import { html } from 'hono/html';
import { stream } from 'hono/streaming';

// Set default hook to catch validation errors
const app = new OpenAPIHono<Env>({ defaultHook });

// Attachment endpoints
const attachmentsRouteHandlers = app
  /**
   * Proxy to electric for syncing to client
   * Hono handlers are executed in registration order, so registered first to avoid route collisions.
   */
  .openapi(attachmentRoutes.shapeProxy, async (ctx) => {
    const url = new URL(ctx.req.url);

    // Construct the upstream URL
    const originUrl = new URL(`${config.electricUrl}/v1/shape?table=attachments&api_secret=${env.ELECTRIC_API_SECRET}`);

    // Copy over the relevant query params that the Electric client adds
    // so that we return the right part of the Shape log.
    url.searchParams.forEach((value, key) => {
      if (['live', 'handle', 'offset', 'cursor', 'where'].includes(key)) {
        originUrl.searchParams.set(key, value);
      }
    });

    // TODO: removing headers is not needed anymore? When proxying long-polling requests, content-encoding & content-length are added
    // erroneously (saying the body is gzipped when it's not) so we'll just remove
    // them to avoid content decoding errors in the browser.

    try {
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
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown electric error');
      return errorResponse(ctx, 500, 'sync_failed', 'error', undefined, { entity: 'attachments' }, error);
    }
  })
  /*
   * Create one or more attachments
   */
  .openapi(attachmentRoutes.createAttachments, async (ctx) => {
    const newAttachments = ctx.req.valid('json');

    const organization = getContextOrganization();
    const attachmentRestrictions = organization.restrictions.attachment;

    if (attachmentRestrictions !== 0 && newAttachments.length > attachmentRestrictions) {
      return errorResponse(ctx, 403, 'restrict_by_org', 'warn', 'attachment');
    }

    const currentAttachments = await db.select().from(attachmentsTable).where(eq(attachmentsTable.organizationId, organization.id));

    if (attachmentRestrictions !== 0 && currentAttachments.length + newAttachments.length > attachmentRestrictions) {
      return errorResponse(ctx, 403, 'restrict_by_org', 'warn', 'attachment');
    }

    const user = getContextUser();
    const groupId = newAttachments.length > 1 ? nanoid() : null;

    const fixedNewAttachments = newAttachments.map((el) => ({
      ...el,
      name: el.filename.split('.').slice(0, -1).join('.'),
      createdBy: user.id,
      groupId,
      organizationId: organization.id,
    }));

    const createdAttachments = await db.insert(attachmentsTable).values(fixedNewAttachments).returning();

    const data = await enrichAttachmentsWithUrls(createdAttachments);

    logEvent(`${createdAttachments.length} attachments have been created`);

    return ctx.json({ success: true, data }, 200);
  })
  /*
   * Get attachments
   */
  .openapi(attachmentRoutes.getAttachments, async (ctx) => {
    const { q, sort, order, offset, limit, attachmentId } = ctx.req.valid('query');

    const user = getContextUser();
    const organization = getContextOrganization();

    // Filter at least by valid organization
    const filters: SQL[] = [
      eq(attachmentsTable.organizationId, organization.id),
      // If s3 is off, show attachments that not have a public CDN URL only to users that create it because in that case attachments stored in IndexedDB
      ...(!config.has.uploadEnabled
        ? [
            or(
              and(eq(attachmentsTable.createdBy, user.id), like(attachmentsTable.originalKey, 'blob:http%')),
              notLike(attachmentsTable.originalKey, 'blob:http%'),
            ) as SQL,
          ]
        : []),
    ];

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

    if (attachmentId) {
      // Retrieve target attachment
      const [targetAttachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, attachmentId)).limit(1);
      if (!targetAttachment) return errorResponse(ctx, 404, 'not_found', 'warn', 'attachment', { attachmentId });

      const items = await enrichAttachmentsWithUrls([targetAttachment]);
      // return target attachment itself if no groupId
      if (!targetAttachment.groupId) return ctx.json({ success: true, data: { items, total: 1 } }, 200);

      // add filter attachments by groupId
      filters.push(eq(attachmentsTable.groupId, targetAttachment.groupId));
    }

    const attachmentsQuery = db
      .select()
      .from(attachmentsTable)
      .where(and(...filters))
      .orderBy(orderColumn);

    const attachments = await attachmentsQuery.offset(Number(offset)).limit(Number(limit));

    const [{ total }] = await db.select({ total: count() }).from(attachmentsQuery.as('attachments'));

    const items = await enrichAttachmentsWithUrls(attachments);

    return ctx.json({ success: true, data: { items, total } }, 200);
  })
  /*
   * Get attachment by id
   */
  .openapi(attachmentRoutes.getAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');

    // Scope the attachment to organization
    const organization = getContextOrganization();

    const [attachment] = await db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.id, id), eq(attachmentsTable.organizationId, organization.id)));

    if (!attachment) return errorResponse(ctx, 404, 'not_found', 'warn', 'attachment');

    const data = await enrichAttachmentWithUrls(attachment);

    return ctx.json({ success: true, data }, 200);
  })
  /*
   * Update an attachment by id
   */
  .openapi(attachmentRoutes.updateAttachment, async (ctx) => {
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

    const data = await enrichAttachmentWithUrls(updatedAttachment);

    return ctx.json({ success: true, data }, 200);
  })
  /*
   * Delete attachments by ids
   */
  .openapi(attachmentRoutes.deleteAttachments, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    const memberships = getContextMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) return errorResponse(ctx, 400, 'invalid_request', 'error', 'attachment');

    const { allowedIds, disallowedIds } = await splitByAllowance('delete', 'attachment', toDeleteIds, memberships);

    // Map errors for disallowed ids
    const errors: ErrorType[] = disallowedIds.map((id) => createError(ctx, 404, 'not_found', 'warn', 'attachment', { attachment: id }));
    if (!allowedIds.length) return errorResponse(ctx, 403, 'forbidden', 'warn', 'attachment');

    // Delete the attachments
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, allowedIds));

    logEvent('Attachments deleted', { ids: allowedIds.join() });

    return ctx.json({ success: true, errors }, 200);
  })
  /*
   * Get attachment cover
   */
  .openapi(attachmentRoutes.getAttachmentCover, async (ctx) => {
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
  /*
   * Redirect to attachment
   */
  .openapi(attachmentRoutes.redirectToAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const [attachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id));
    if (!attachment) return errorResponse(ctx, 404, 'not_found', 'warn', 'attachment');

    let redirectUrl = `${config.frontendUrl}/${attachment.organizationId}/attachments?attachmentDialogId=${attachment.id}`;
    if (attachment.groupId) redirectUrl += `&groupId=${attachment.groupId}`;

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

export default attachmentsRouteHandlers;
