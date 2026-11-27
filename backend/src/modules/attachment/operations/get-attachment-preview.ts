import { appConfig } from 'shared';
import { type FileKindName, fileKindOf } from 'shared/utils/file-kind';
import { formatBytes } from 'shared/utils/format-bytes';
import { buildNotificationLink } from 'shared/utils/notification-link';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { homeChannelOf } from '#/db/utils/home-channel';
import type { LinkedChannel, LinkPreview } from '#/lib/module';
import { withActorRef } from '#/modules/actors/actor-refs';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';
import { findAttachmentHost, findLinkedAttachment } from '#/modules/attachment/attachment-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
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

/** The `/n` link: signs a visitor in, then opens the file over its host on the host's channel page, else on its own. */
const openUrl = async (ctx: DbContext, attachment: AttachmentModel) => {
  const host = await findAttachmentHost(ctx, attachment);
  return buildNotificationLink(appConfig.frontendUrl, {
    tenantId: attachment.tenantId,
    organizationId: attachment.organizationId,
    ...(host?.home ?? homeChannelOf('attachment', attachment)),
    productType: 'attachment',
    subjectId: attachment.id,
    contextId: host?.id,
  });
};

const shortDate = (iso: string) => {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
};

/** Unfurl of `/{code}/a7` over a picture of the file's kind, never the file; a private file unfurls as a plain private file. */
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

  // Anyone holding one link can try every number of its channel. A private file shows no name, kind, size, uploader or channel.
  if (!found.public) {
    return {
      title: 'Private file',
      ogTitle: 'Private file',
      description: 'Only people with access can open this file.',
      redirectUrl: await openUrl(ctx, found),
      image: '/static/link-previews/file.jpg',
      indexable: false,
    };
  }

  const attachment = await withActorRef(ctx, found);
  const linked = await resolveEntity(ctx, { entityType: channel.channelType, identifier: channel.channelId });
  if (!linked) throw notFound();

  const kind = fileKindOf(attachment.convertedContentType || attachment.contentType);
  const { filename } = attachment;
  const extension = filename.lastIndexOf('.') > 0 ? filename.slice(filename.lastIndexOf('.') + 1).toUpperCase() : kindWords[kind];
  const added = `added ${shortDate(attachment.createdAt)}${attachment.createdBy ? ` by ${attachment.createdBy.name}` : ''}`;

  return {
    title: `${kindWords[kind]} in ${linked.name || 'Untitled'}`,
    ogTitle: attachment.name || filename,
    description: [extension, attachment.size > 0 && formatBytes(attachment.size), added].filter(Boolean).join(' · '),
    redirectUrl: await openUrl(ctx, found),
    image: `/static/link-previews/${kind}.jpg`,
    indexable: attachment.public,
  };
}
