import { uploadTemplates } from '#/lib/transloadit/templates';

import type { AssemblyResponse } from '@uppy/transloadit';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/api';

/**
 * Prepares files for offline storage and returns successfully uploaded files.
 *
 * @param files - Fle object containing metadata and upload details.
 * @returns An array of files that were successfully prepared for offline storage.
 */
// TODO(UPLOAD) handle offline video audio & file
export const prepareFilesForOffline = async (files: Record<string, CustomUppyFile>, tokenQuery: UploadTokenQuery) => {
  console.warn('Files will be stored offline in indexedDB.');

  const template = uploadTemplates.attachment;
  const templateKey = template.use[0];

  // Save files to local storage
  await LocalFileStorage.addData(files, tokenQuery);

  // Prepare files for a manual 'complete' event (successfully uploaded files)
  const localFiles = Object.values(files).map((el) => ({
    id: el.id,
    size: el.size,
    type: el.type,
    mime: el.meta.type,
    ext: el.extension,
    url: el.preview,
    original_name: el.meta.name,
    original_id: el.id,
  }));

  return {
    ok: 'OFFLINE_UPLOAD',
    results: {
      [templateKey]: localFiles,
    },
  } as unknown as AssemblyResponse;
};
