import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { maxFilesPerUpload } from 'shared/utils/upload-visibility';
import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import { uploadResultsOf } from '~/modules/common/uploader/types';

/** Upload and encoding together; past it the upload counts as failed. */
const uploadTimeoutMs = 5 * 60 * 1000;

/**
 * Uploads files through the attachment template in one go, without a dialog, and resolves with their rows unpersisted,
 * in the order of `files`. More than one share a `groupId`. Offline it resolves at once, the files stored on this device.
 */
export const uploadAttachmentFiles = async (files: File[], organizationId: string): Promise<Attachment[]> => {
  // Uppy and its plugins load with the first upload: the attachment module that imports this file runs at boot
  const { createUppy } = await import('~/modules/common/uploader/helpers/uppy-helpers');
  const { defaultRestrictions } = appConfig.uppy;
  const uppy = await createUppy(
    {
      restrictions: {
        ...defaultRestrictions,
        allowedFileTypes: ['*/*'],
        maxNumberOfFiles: maxFilesPerUpload,
        maxTotalFileSize: maxFilesPerUpload * defaultRestrictions.maxFileSize,
      },
    },
    { templateId: 'attachment', organizationId },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await new Promise<Attachment[]>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Upload timed out')), uploadTimeoutMs);
      // The id each file's row gets, in the order the files were given.
      const rowIds: (string | undefined)[] = [];

      uppy
        .on('transloadit:complete', (assembly) => {
          // A failed assembly reaches the assembly-error listener
          if (assembly.error) return;
          const attachments = parseUploadedAttachments(uploadResultsOf<'attachment'>(assembly), organizationId);
          if (attachments.length !== files.length) return reject(new Error('Upload returned fewer files than it was given'));
          resolve(attachments.sort((a, b) => rowIds.indexOf(a.id) - rowIds.indexOf(b.id)));
        })
        .on('transloadit:assembly-error', (_assembly, error) => reject(error))
        .on('upload-error', (_file, error) => reject(error))
        .on('restriction-failed', (_file, error) => reject(error))
        .on('error', (error) => reject(error));

      // A refused file throws here, which rejects the promise.
      for (const file of files) rowIds.push(uppy.getFile(uppy.addFile({ name: file.name, type: file.type, data: file })).meta.attachmentId);
      uppy.upload().catch(reject);
    });
  } finally {
    clearTimeout(timer);
    uppy.destroy();
  }
};
