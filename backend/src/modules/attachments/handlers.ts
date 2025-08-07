import { db } from '#/db/db';
import { attachmentsTable } from '#/db/schema/attachments';
import { organizationsTable } from '#/db/schema/organizations';
import { env } from '#/env';
import { type Env, getContextMemberships, getContextOrganization, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { processAttachmentUrls, processAttachmentUrlsBatch } from '#/modules/attachments/helpers/process-attachment-urls';
import attachmentRoutes from '#/modules/attachments/routes';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { splitByAllowance } from '#/permissions/split-by-allowance';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { OpenAPIHono } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { and, count, eq, inArray } from 'drizzle-orm';
import { html, raw } from 'hono/html';
import { stream } from 'hono/streaming';

const app = new OpenAPIHono<Env>({ defaultHook });

const attachmentsRouteHandlers = app
  /**
   * Proxy to electric for syncing to client
   * Hono handlers are executed in registration order, so registered first to avoid route collisions.
   */
  .openapi(attachmentRoutes.shapeProxy, async (ctx) => {
    const url = new URL(ctx.req.url);
    const organization = getContextOrganization();

    // Extract organization IDs from `where` clause
    const whereParam = url.searchParams.get('where') ?? '';
    const [requestedOrganizationId] = [...whereParam.matchAll(/organization_id = '([^']+)'/g)].map((m) => m[1]);

    if (requestedOrganizationId !== organization.id) {
      throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', meta: { toastMessage: 'Denied: organization mismatch.' } });
    }

    // Construct the upstream URL
    const originUrl = new URL(`${appConfig.electricUrl}/v1/shape?table=attachments&api_secret=${env.ELECTRIC_API_SECRET}`);

    // Copy over the relevant query params that the Electric client adds
    // so that we return the right part of the Shape log.
    url.searchParams.forEach((value, key) => {
      if (['live', 'handle', 'offset', 'cursor', 'where'].includes(key)) {
        originUrl.searchParams.set(key, value);
      }
    });

    try {
      const { body, headers, status, statusText } = await fetch(originUrl.toString());

      // Fetch decompresses the body but doesn't remove the
      // content-encoding & content-length headers which would
      // break decoding in the browser.
      //
      // See https://github.com/whatwg/fetch/issues/1729
      const newHeaders = new Headers(headers);
      newHeaders.delete('content-encoding');
      newHeaders.delete('content-length');

      // Construct a new Response you control
      return new Response(body, { status, statusText, headers: newHeaders });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown electric error');
      throw new AppError({
        name: error.name,
        message: error.message,
        status: 500,
        type: 'sync_failed',
        severity: 'error',
        entityType: 'attachment',
        originalError: error,
      });
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
      throw new AppError({ status: 403, type: 'restrict_by_org', severity: 'warn', entityType: 'attachment' });
    }

    const [{ currentAttachments }] = await db
      .select({ currentAttachments: count() })
      .from(attachmentsTable)
      .where(eq(attachmentsTable.organizationId, organization.id));

    if (attachmentRestrictions !== 0 && currentAttachments + newAttachments.length > attachmentRestrictions) {
      throw new AppError({ status: 403, type: 'restrict_by_org', severity: 'warn', entityType: 'attachment' });
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

    const data = await processAttachmentUrlsBatch(createdAttachments);

    logEvent('info', `${createdAttachments.length} attachments have been created`);

    return ctx.json(data, 200);
  })
  /*
   * Get grouped attachments
   */
  .openapi(attachmentRoutes.getAttachmentsGroup, async (ctx) => {
    const { mainAttachmentId } = ctx.req.valid('query');

    const organization = getContextOrganization();

    // Retrieve target attachment
    const [targetAttachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, mainAttachmentId)).limit(1);
    if (!targetAttachment) {
      throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'attachment', meta: { mainAttachmentId } });
    }

    const processedTargetAttachment = await processAttachmentUrlsBatch([targetAttachment]);
    // return target attachment itself if no groupId
    if (!targetAttachment.groupId) return ctx.json(processedTargetAttachment, 200);

    // add filter attachments by groupId

    const attachments = await db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.groupId, targetAttachment.groupId), eq(attachmentsTable.organizationId, organization.id)));

    const processedAttachments = await processAttachmentUrlsBatch(attachments);

    return ctx.json(processedAttachments, 200);
  })
  /*
   * Get attachment by id
   */
  .openapi(attachmentRoutes.getAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const attachment = await getValidProductEntity(id, 'attachment', 'organization', 'read');

    const data = await processAttachmentUrls(attachment);

    return ctx.json(data, 200);
  })
  /*
   * Update an attachment by id
   */
  .openapi(attachmentRoutes.updateAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');

    await getValidProductEntity(id, 'attachment', 'organization', 'update');

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

    const data = await processAttachmentUrls(updatedAttachment);

    logEvent('info', 'Attachment updated', { attachmentId: updatedAttachment.id });

    return ctx.json(data, 200);
  })
  /*
   * Delete attachments by ids
   */
  .openapi(attachmentRoutes.deleteAttachments, async (ctx) => {
    const { ids } = ctx.req.valid('json');

    const memberships = getContextMemberships();

    // Convert the ids to an array
    const toDeleteIds = Array.isArray(ids) ? ids : [ids];
    if (!toDeleteIds.length) throw new AppError({ status: 400, type: 'invalid_request', severity: 'warn', entityType: 'attachment' });

    const { allowedIds, disallowedIds: rejectedItems } = await splitByAllowance('delete', 'attachment', toDeleteIds, memberships);

    if (!allowedIds.length) throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType: 'attachment' });

    // Delete the attachments
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, allowedIds));

    logEvent('info', 'Attachments deleted', allowedIds);

    return ctx.json({ success: true, rejectedItems }, 200);
  })
  /*
   * Get attachment cover
   */
  .openapi(attachmentRoutes.getAttachmentCover, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const [attachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id));

    if (!attachment) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'attachment' });

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
      // biome-ignore lint/suspicious/noExplicitAny: unable to infer type due to dynamic data structure
      await stream.pipe({} as any);
    });
  })
  /*
   * Redirect to attachment
   */
  .openapi(attachmentRoutes.redirectToAttachment, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const [attachment] = await db.select().from(attachmentsTable).where(eq(attachmentsTable.id, id));
    if (!attachment) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'attachment' });

    const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, attachment.organizationId));
    if (!organization) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'organization' });

    const url = new URL(`${appConfig.frontendUrl}/organizations/${organization.slug}/attachments`);
    url.searchParams.set('attachmentDialogId', attachment.id);
    if (attachment.groupId) url.searchParams.set('groupId', attachment.groupId);

    const redirectUrl = url.toString();

    return ctx.html(html`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />

          <title>${attachment.filename}</title>
          <meta property="og:description" content="View an attachment in ${organization.name}." />
          <meta name="description" content="View an attachment in ${organization.name}." />
          <meta property="og:url" content="${redirectUrl}" />

          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="${appConfig.name}" />
          <meta property="og:locale" content="${appConfig.defaultLanguage}" />
          <link rel="logo" type="image/png" href="/static/logo/logo.png" />
          <link rel="icon" type="image/png" sizes="512x512" href="/static/icons/icon-512x512.png" />
          <link rel="icon" type="image/png" sizes="192x192" href="/static/icons/icon-192x192.png" />
          <meta name="robots" content="index,follow" />
        </head>
      <script>
        ${raw(`window.location.href = "${redirectUrl}";`)}
      </script>
      </html>
    `);
  });

export default attachmentsRouteHandlers;
