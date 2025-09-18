import type { AssemblyResponse } from '@uppy/transloadit';
import { uploadTemplates } from 'config/templates';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import type { CustomUppyFile, UploadedFile } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';

/**
 * Prepares files for offline storage and returns successfully uploaded files.
 *
 * @param files - Fle object containing metadata and upload details.
 * @returns An array of files that were successfully prepared for offline storage.
 */
export const prepareFilesForOffline = async (files: Record<string, CustomUppyFile>, tokenQuery: UploadTokenQuery) => {
  console.warn('Files will be stored offline in indexedDB.');

  const template = uploadTemplates.attachment;
  const templateKey = template.use[0];

  // Save files to local storage
  await LocalFileStorage.addData(files, tokenQuery);

  // Prepare files for a manual 'complete' event (successfully uploaded files)
  const localFiles = Object.values(files).map((el) => {
    const basename = el.meta.name?.replace(`.${el.extension}`, '');
    const type = el.type?.split('/')[0] || 'file';

    // Convert all meta values to strings
    const user_meta = Object.fromEntries(Object.entries(el.meta || {}).map(([key, value]) => [key, String(value)]));

    return {
      as: '',
      basename,
      cost: 0,
      exec_time: 0,
      ext: el.extension,
      field: 'file',
      from_batch_import: false,
      id: el.id,
      is_temp_url: false,
      is_tus_file: false,
      md5hash: '',
      meta: {},
      mime: el.type,
      name: el.meta.name,
      original_id: el.id,
      original_basename: basename,
      original_name: el.meta.name,
      original_md5hash: '',
      original_path: '',
      queue: '',
      queue_time: 0,
      execTime: 0,
      queueTime: 0,
      localId: el.id,
      size: el.size || el.data.size,
      url: el.preview!,
      ssl_url: el.preview!,
      tus_upload_url: '',
      type,
      user_meta,
    };
  }) satisfies UploadedFile[];

  return {
    ok: 'OFFLINE_UPLOAD',
    results: {
      [templateKey]: localFiles,
    },
  } as unknown as AssemblyResponse;
};
