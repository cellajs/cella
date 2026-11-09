import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import { persistAttachments } from '~/modules/attachment/helpers/persist-attachments';
import { createUppy } from '~/modules/common/uploader/helpers/uppy-helpers';
import { uploadResultsOf } from '~/modules/common/uploader/types';

type PersistScope = Parameters<typeof persistAttachments>[1];

/** Upload and encoding together; past it the upload counts as failed. */
const uploadTimeoutMs = 5 * 60 * 1000;

/** Uploads one file through the attachment template without a dialog and resolves with its row unpersisted; offline it resolves at once, stored on this device. */
export const uploadAttachmentFile = async (file: File, organizationId: string): Promise<Attachment> => {
  const uppy = await createUppy(
    { restrictions: { ...appConfig.uppy.defaultRestrictions, allowedFileTypes: ['*/*'] } },
    { templateId: 'attachment', organizationId },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await new Promise<Attachment>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Upload timed out')), uploadTimeoutMs);

      uppy
        .on('transloadit:complete', (assembly) => {
          // A failed assembly reaches the assembly-error listener
          if (assembly.error) return;
          const [attachment] = parseUploadedAttachments(uploadResultsOf<'attachment'>(assembly), organizationId);
          if (attachment) resolve(attachment);
          else reject(new Error('Upload returned no file'));
        })
        .on('transloadit:assembly-error', (_assembly, error) => reject(error))
        .on('upload-error', (_file, error) => reject(error))
        .on('restriction-failed', (_file, error) => reject(error))
        .on('error', (error) => reject(error));

      // A refused file throws here, which rejects the promise.
      uppy.addFile({ name: file.name, type: file.type, data: file });
      uppy.upload().catch(reject);
    });
  } finally {
    clearTimeout(timer);
    uppy.destroy();
  }
};

/**
 * Uploads one file and persists its row through the queued create, as a finished upload dialog does; resolves once the row exists.
 * @public
 */
export const uploadAndPersistAttachment = async (file: File, scope: PersistScope): Promise<Attachment> => {
  const attachment = await uploadAttachmentFile(file, scope.organizationId);
  // A description that names the id before the row exists loses it: the server keeps only embedded ids it finds (`filterExistingProductIds`)
  await persistAttachments([attachment], scope);
  return attachment;
};
