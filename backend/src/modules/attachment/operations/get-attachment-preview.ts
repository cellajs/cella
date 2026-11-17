import { eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { type FileKindName, fileKindOf } from 'shared/utils/file-kind';
import { formatBytes } from 'shared/utils/format-bytes';
import { buildNotificationLink } from 'shared/utils/notification-link';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { channelTables } from '#/db/channel-tables';
import { homeChannelOf } from '#/db/utils/home-channel';
import type { LinkedChannel, LinkPreview } from '#/lib/module';
import { withActorRef } from '#/modules/actors/actor-refs';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';
import { findAttachmentHost, findLinkedAttachment } from '#/modules/attachment/attachment-queries';
import { findMovedEntityId } from '#/modules/numbering/numbering-queries';

const kindWords: Record<FileKindName, string> = {
  spreadsheet: 'Spreadsheet',
  presentation: 'Presentation',
  archive: 'Archive',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  json: 'JSON file',
  pdf: 'PDF',
  document: 'Document',
  text: 'Text file',
  file: 'File',
};

const notFound = () => new AppError(404, 'not_found', 'warn', { entityType: 'attachment', willRedirect: true });

/**
 * The notification link to the file: signs a visitor in first, then opens the file over the row that keeps it, a task
 * say, on its channel's page, else on its own home channel's. Any channel type routes there, through the page its
 * module names.
 */
const openUrl = async (ctx: DbContext, attachment: AttachmentModel) => {
  const host = await findAttachmentHost(ctx, attachment);
  const { id: channelId, type: channelType } = host?.home ?? homeChannelOf('attachment', attachment);
  return buildNotificationLink(appConfig.frontendUrl, {
    tenantId: attachment.tenantId,
    organizationId: attachment.organizationId,
    channelType,
    channelId,
    productType: 'attachment',
    subjectId: attachment.id,
    contextId: host?.id,
  });
};

const channelName = async (ctx: DbContext, { channelType, channelId }: Pick<LinkedChannel, 'channelType' | 'channelId'>) => {
  const table = channelTables[channelType]();
  const [channel] = await ctx.var.db.select({ name: table.name }).from(table).where(eq(table.id, channelId)).limit(1);
  return channel?.name;
};

const shortDate = (iso: string) => {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
};

/**
 * The unfurl of a file's share link `/{code}/a7`: its name, kind and channel, size, date and uploader, over a picture
 * of its kind, never of the file. Like a task's, it shows for a private file too: opening it still takes access.
 */
export async function getAttachmentPreviewOp(ctx: DbContext, channel: LinkedChannel, number: number): Promise<LinkPreview> {
  const found = await findLinkedAttachment(ctx, { channelId: channel.channelId, number });

  if (!found) {
    // Says no more than that the file moved: the channel it went to may be one the link's holder cannot see.
    const movedId = await findMovedEntityId(ctx, { channelId: channel.channelId, productType: 'attachment', number });
    const moved = movedId && (await findLinkedAttachment(ctx, { id: movedId }));
    if (!moved) throw notFound();
    return {
      title: 'File moved',
      ogTitle: 'File moved',
      description: 'This file moved elsewhere.',
      redirectUrl: await openUrl(ctx, moved),
      indexable: false,
    };
  }

  const attachment = await withActorRef(ctx, found);
  const name = await channelName(ctx, channel);
  if (name === undefined) throw notFound();

  const kind = fileKindOf(attachment.convertedContentType || attachment.contentType);
  const { filename } = attachment;
  const extension = filename.lastIndexOf('.') > 0 ? filename.slice(filename.lastIndexOf('.') + 1).toUpperCase() : kindWords[kind];
  const added = `added ${shortDate(attachment.createdAt)}${attachment.createdBy ? ` by ${attachment.createdBy.name}` : ''}`;

  return {
    title: `${kindWords[kind]} in ${name || 'Untitled'}`,
    ogTitle: attachment.name || filename,
    description: [extension, attachment.size > 0 && formatBytes(attachment.size), added].filter(Boolean).join(' · '),
    redirectUrl: await openUrl(ctx, found),
    image: `/static/link-previews/${kind}.jpg`,
    indexable: attachment.public,
  };
}
