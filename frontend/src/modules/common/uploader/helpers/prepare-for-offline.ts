import type { AssemblyResponse } from '@uppy/transloadit';
import { t } from 'i18next';
import type { UploadTemplateId } from 'shared';
import { uploadTemplates } from 'shared/transloadit-config';
import type { UploadStatus } from '~/modules/attachment/offline/attachments-db';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { toaster } from '~/modules/common/toaster/toaster';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';

/** Stores each file's blob locally, under the id its attachment row will be created with. */
export const storeUploadBlobs = async (files: CustomUppyFile[], organizationId: string, templateId: UploadTemplateId, status: UploadStatus) => {
  for (const file of files) await attachmentStorage.storeUploadBlob(file, organizationId, status, { templateId }, file.meta.attachmentId);
};

/** Stores the files on this device, for the upload service to send once cloud storage is reachable, and answers with a completed assembly. */
export const prepareFilesForOffline = async (
  files: CustomUppyFile[],
  { organizationId, templateId }: UploadTokenQuery,
  uploadStatus: UploadStatus,
): Promise<AssemblyResponse> => {
  const [resultStep] = uploadTemplates.attachment.use;

  if (!organizationId) {
    throw new Error('organizationId required for local storage');
  }

  await storeUploadBlobs(files, organizationId, templateId, uploadStatus);

  toaster.info(t('c:saved_on_this_device'));

  const localFiles = files.map((file) => {
    const basename = file.meta.name?.replace(`.${file.extension}`, '');
    const type = file.type?.split('/')[0] || 'file';

    const userMeta = Object.fromEntries(Object.entries(file.meta || {}).map(([key, value]) => [key, String(value)]));

    return {
      as: '',
      basename,
      cost: 0,
      exec_time: 0,
      ext: file.extension,
      field: 'file',
      from_batch_import: false,
      id: file.id,
      is_temp_url: false,
      is_tus_file: false,
      md5hash: '',
      meta: {},
      mime: file.type,
      name: file.meta.name,
      original_id: file.id,
      original_basename: basename,
      original_name: file.meta.name,
      original_md5hash: '',
      original_path: '',
      queue: '',
      queue_time: 0,
      execTime: 0,
      queueTime: 0,
      localId: file.id,
      size: file.size || file.data?.size || 0,
      url: file.preview!,
      ssl_url: file.preview!,
      tus_upload_url: '',
      type,
      user_meta: userMeta,
    };
  });

  const totalBytes = localFiles.reduce((total, file) => total + file.size, 0);

  return {
    ok: 'ASSEMBLY_COMPLETED',
    assembly_id: `offline_${Date.now()}`,
    assembly_url: '',
    assembly_ssl_url: '',
    start_date: new Date().toISOString(),
    execution_duration: 0,
    bytes_received: totalBytes,
    bytes_expected: totalBytes,
    uploads: localFiles,
    results: { [resultStep]: localFiles },
  };
};
