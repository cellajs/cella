import type { AssemblyResponse } from '@uppy/transloadit';
import { uploadTemplates } from 'shared/upload-templates';
import type { UploadContext, UploadStatus } from '~/modules/attachment/dexie/attachments-db';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';

type PrepareFilesForOffline = (
  files: Record<string, CustomUppyFile>,
  tokenQuery: UploadTokenQuery,
  uploadStatus?: UploadStatus,
) => Promise<AssemblyResponse>;

/**
 * Prepares files for offline/local storage and returns an assembly response.
 * Stores blobs in Dexie for later upload (when online) or permanent local storage.
 */
export const prepareFilesForOffline: PrepareFilesForOffline = async (files, tokenQuery, uploadStatus = 'pending') => {
  console.warn('Files will be stored locally in IndexedDB.');

  const template = uploadTemplates.attachment;
  const templateKey = template.use[0];
  const organizationId = tokenQuery.organizationId;

  if (!organizationId) {
    throw new Error('organizationId required for local storage');
  }

  // Build upload context for sync worker
  const uploadContext: UploadContext = {
    templateId: tokenQuery.templateId,
    public: tokenQuery.public,
  };

  // Store each file blob locally
  for (const file of Object.values(files)) {
    await attachmentStorage.storeUploadBlob(file, organizationId, uploadStatus, uploadContext);
  }

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
      size: el.size || el.data?.size || 0,
      url: el.preview!,
      ssl_url: el.preview!,
      tus_upload_url: '',
      type,
      user_meta,
    };
  });

  return {
    ok: 'ASSEMBLY_COMPLETED',
    assembly_id: `offline_${Date.now()}`,
    assembly_url: '',
    assembly_ssl_url: '',
    start_date: new Date().toISOString(),
    execution_duration: 0,
    bytes_received: localFiles.reduce((total, file) => total + (file.size || 0), 0),
    bytes_expected: localFiles.reduce((total, file) => total + (file.size || 0), 0),
    uploads: localFiles,
    results: {
      [templateKey]: localFiles,
    },
  };
};
