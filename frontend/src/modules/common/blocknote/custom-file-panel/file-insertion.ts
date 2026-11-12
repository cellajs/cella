import i18n from 'i18next';
import type { Attachment } from 'sdk';
import { isTextFile } from '~/modules/attachment/file-placeholder';
import { uploadAttachmentFiles } from '~/modules/attachment/helpers/upload-file';
import { flagBlocks } from '~/modules/common/blocknote/custom-elements/media/media-uploads-extension';
import { excerptLength } from '~/modules/common/blocknote/helpers/pasted-text';
import type { BlockNoteMediaMode, CustomBlockMediaTypes, CustomBlockNoteEditor, EditorMedia, MediaUpload } from '~/modules/common/blocknote/types';
import { toaster } from '~/modules/common/toaster/toaster';

/** An editor's media in an attachment upload mode: every file it adds becomes a row. */
export type AttachmentMedia = EditorMedia & { upload: Extract<MediaUpload, { persist: unknown }> };

export const isAttachmentMedia = (media: EditorMedia | undefined): media is AttachmentMedia => !!media?.upload && 'persist' in media.upload;

/** What a media block holds once its file is known. */
export interface FileBlockProps {
  name: string;
  url: string;
  attachmentId?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  excerpt?: string;
}

/** The block type a file of this content type becomes. */
const mediaTypeOf = (mimeType: string | undefined): CustomBlockMediaTypes => {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  return 'file';
};

/**
 * An attachment as a block: referenced by id, or by cloud key in a public mode whose upload is in the public bucket
 * (images the mid-size preview, other types the converted variant, never the full-size file).
 */
export const attachmentBlockProps = (attachment: Attachment, mediaMode: BlockNoteMediaMode): FileBlockProps => {
  const { keys, id, filename, contentType, size } = attachment;
  const publicKey = contentType.startsWith('image/') ? keys.preview || keys.converted || keys.original : keys.converted || keys.original;
  const url = mediaMode !== 'private-attachment' && attachment.publicBucket ? publicKey : id;
  return { name: filename, url, attachmentId: id, mimeType: contentType, size };
};

/** Read an image blob's intrinsic pixel size by decoding it locally; returns null when it cannot decode. */
const measureImageBlobSize = (blob: Blob): Promise<{ width: number; height: number } | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const size = image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null;
      URL.revokeObjectURL(url);
      resolve(size);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });

/** What only the file itself tells: an image's pixel size, a text file's first characters. */
export const readFileFacts = async (blob: Blob, mimeType: string | undefined): Promise<Partial<FileBlockProps>> => {
  if (mimeType?.startsWith('image/')) return (await measureImageBlobSize(blob)) ?? {};
  if (isTextFile(mimeType)) return { excerpt: (await blob.text()).slice(0, excerptLength) };
  return {};
};

/**
 * Writes uploaded files into the document: the first fills `targetBlockId`, the others follow it. Every file stays
 * referenced: with the target gone (an editor remount dropped it) they go after the last block. The target keeps its
 * block type unless `typeFromContent`.
 */
export const writeFileBlocks = (editor: CustomBlockNoteEditor, files: FileBlockProps[], targetBlockId: string, typeFromContent: boolean) => {
  editor.transact(() => {
    const target = editor.getBlock(targetBlockId);
    let reference = target ?? editor.document[editor.document.length - 1];
    for (const [index, props] of files.entries()) {
      const type = mediaTypeOf(props.mimeType);
      if (index === 0 && target) reference = editor.updateBlock(target, typeFromContent ? { type, props } : { props });
      else if (reference) [reference] = editor.insertBlocks([{ type, props }], reference, 'after');
    }
  });
};

/**
 * Adds files to the document: a block per file at once, showing the file's name while one upload sends them all, then
 * the rows, then each block's reference. Without `at` they go where the cursor is. A failed upload takes its blocks out.
 */
export async function insertFiles(
  editor: CustomBlockNoteEditor,
  files: File[],
  media: AttachmentMedia,
  at?: { blockId: string; placement: 'before' | 'after' },
): Promise<void> {
  const anchor = (at && editor.getBlock(at.blockId)) || editor.getTextCursorPosition().block;
  const placeholders = files.map((file) => ({ type: mediaTypeOf(file.type), props: { name: file.name, mimeType: file.type, size: file.size } }));
  const fillsEmptyParagraph =
    !at && anchor.type === 'paragraph' && Array.isArray(anchor.content) && anchor.content.length === 0 && anchor.children.length === 0;
  const inserted = fillsEmptyParagraph
    ? editor.replaceBlocks([anchor], placeholders).insertedBlocks
    : editor.insertBlocks(placeholders, anchor, at?.placement ?? 'after');
  const blockIds = inserted.map(({ id }) => id);
  flagBlocks(editor, 'uploading', blockIds, true);

  try {
    const [attachments, facts] = await Promise.all([
      uploadAttachmentFiles(files, media.organizationId),
      Promise.all(files.map((file) => readFileFacts(file, file.type))),
    ]);
    // A block names its row only once the row exists: a host keeps only the ids of rows it finds.
    await media.upload.persist(attachments);
    editor.transact(() => {
      for (const [index, attachment] of attachments.entries()) {
        const block = editor.getBlock(blockIds[index]);
        if (block) editor.updateBlock(block, { props: { ...attachmentBlockProps(attachment, media.upload.mediaMode), ...facts[index] } });
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    toaster.error(i18n.t('c:upload_failed'));
    editor.removeBlocks(blockIds.filter((id) => editor.getBlock(id)));
  } finally {
    flagBlocks(editor, 'uploading', blockIds, false);
  }
}
