import type { Attachment } from 'sdk';
import type { UploadTemplateId } from 'shared';
import { uploadTemplates } from 'shared/transloadit-config';
import type { BlockNoteMediaMode } from '~/modules/common/blocknote/types';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';

/** Props of a completed upload's block; `measuredId` keys the image size measured while uploading. */
export type FileBlockProps = { name: string; url: string; attachmentId?: string; measuredId?: string };

/**
 * An attachment as a block: referenced by id, or by cloud key in a public mode whose upload landed in the public bucket
 * (images the mid-size preview, other types the converted variant, never the full-size file).
 */
export const attachmentBlockProps = (
  attachment: Attachment,
  isImage: boolean,
  mediaMode: BlockNoteMediaMode,
): FileBlockProps => {
  const publicKey = isImage
    ? attachment.keys.preview || attachment.keys.converted || attachment.keys.original
    : attachment.keys.converted || attachment.keys.original;
  const url = mediaMode !== 'private-attachment' && attachment.publicBucket ? publicKey : attachment.id;
  return { name: attachment.filename, url, attachmentId: attachment.id, measuredId: attachment.id };
};

/** Files a template without an attachment row stored: each block keeps the stored key of the exported image. */
export const storedFileBlockProps = (
  results: Partial<UploadedUppyFile<UploadTemplateId>>,
  templateId: UploadTemplateId,
): FileBlockProps[] => {
  const [exported] = uploadTemplates[templateId].use;
  return (results[exported] ?? []).map((file) => ({
    name: file.original_name ?? file.name ?? '',
    url: file.url ?? '',
    measuredId: file.user_meta.attachmentId,
  }));
};
