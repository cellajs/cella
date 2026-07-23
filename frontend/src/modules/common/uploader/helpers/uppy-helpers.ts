import { onlineManager } from '@tanstack/react-query';
import { Uppy } from '@uppy/core';
import Transloadit from '@uppy/transloadit';
// biome-ignore lint/style/noRestrictedImports: runtime token fetcher inside Uppy assembly callback; not eligible for a React Query hook.
import { getUploadToken, type UploadToken } from 'sdk';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { makeBlobKey, type UploadContext } from '~/modules/attachment/offline/attachments-db';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { prepareFilesForOffline } from '~/modules/common/uploader/helpers/prepare-for-offline';
import type { CustomUppy, CustomUppyFile, CustomUppyOpt } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';
import { cleanFileName } from '~/utils/clean-file-name';

/**
 * Creates a local-first Uppy instance: when Transloadit is configured (params/signature present) uploads to
 * cloud, otherwise stores locally in IndexedDB; offline uploads queue as pending. The local blob is always
 * stored first, then synced to cloud when available.
 */
export const createBaseTransloaditUppy = async (
  uppyOptions: CustomUppyOpt,
  tokenQuery: UploadTokenQuery,
): Promise<CustomUppy> => {
  // Get upload token early to determine cloud availability
  let cloudToken: UploadToken | null = null;
  let hasCloudUpload = false;

  try {
    // Skip cloud upload when uploadEnabled is false; all files go to IndexedDB.
    if (appConfig.has.uploadEnabled && onlineManager.isOnline()) {
      cloudToken = await getUploadToken({ query: tokenQuery });
      // Cloud upload only available if Transloadit is configured
      hasCloudUpload = !!(cloudToken?.params && cloudToken?.signature);
    }
  } catch (err) {
    // Offline or failed to get token - will use local storage
    if (!(err instanceof Error && err.message.includes('Failed to fetch'))) {
      console.error('Failed to get upload token:', err);
    }
    cloudToken = null;
    hasCloudUpload = false;
  }

  const uppy = new Uppy({
    ...uppyOptions,
    meta: {
      publicBucket: tokenQuery.publicBucket,
      bucketName: tokenQuery.publicBucket ? appConfig.s3.publicBucket : appConfig.s3.privateBucket,
      offlineUploaded: !hasCloudUpload,
    },
    onBeforeFileAdded,
    onBeforeUpload: (files) => {
      // Clean up file names synchronously
      for (const file of Object.values(files)) {
        const cleanName = cleanFileName(file.name || 'file');
        file.name = cleanName;
        file.meta.name = cleanName;
      }
      return files;
    },
  });

  // Handle async operations before upload starts
  uppy.on('upload', async (_uploadId, uploadFiles) => {
    const filesMap = Object.fromEntries(uploadFiles.map((f) => [f.id, f]));

    // 'pending' = cloud available, queue for upload; 'local-only' = no cloud, permanent local storage.
    const isOnline = onlineManager.isOnline();
    const uploadStatus = hasCloudUpload ? 'pending' : 'local-only';

    // If cloud upload not available, store locally and emit completion
    if (!hasCloudUpload) {
      const assembly = await prepareFilesForOffline(filesMap, tokenQuery, uploadStatus);
      uppy.cancelAll();
      uppy.emit('transloadit:complete', assembly);
      return;
    }

    // If offline but cloud is configured, store locally for later sync
    if (!isOnline) {
      const assembly = await prepareFilesForOffline(filesMap, tokenQuery, 'pending');
      uppy.cancelAll();
      uppy.emit('transloadit:complete', assembly);
      return;
    }

    // Online with cloud - store locally first (as pending), then upload
    const organizationId = tokenQuery.organizationId;
    if (organizationId) {
      const uploadContext: UploadContext = {
        templateId: tokenQuery.templateId,
        publicBucket: tokenQuery.publicBucket,
      };
      for (const file of uploadFiles) {
        await attachmentStorage.storeUploadBlob(file, organizationId, 'pending', uploadContext, file.meta.attachmentId);
      }
    }
  });

  // Only add Transloadit plugin if cloud upload is available
  if (hasCloudUpload && cloudToken?.params && cloudToken?.signature) {
    uppy.use(Transloadit, {
      waitForEncoding: true,
      alwaysRunAssembly: true,
      assemblyOptions: {
        params: cloudToken.params,
        signature: cloudToken.signature,
      },
    });

    // On successful cloud upload, mark local blobs as uploaded
    uppy.on('transloadit:complete', async (assembly) => {
      // Skip offline assemblies (already marked correctly)
      if (assembly.assembly_id?.startsWith('offline_')) return;
      if (assembly.ok !== 'ASSEMBLY_COMPLETED') return;

      for (const upload of assembly.uploads || []) {
        const attachmentId = uploadAttachmentId(upload);
        if (attachmentId) await attachmentStorage.markUploaded(makeBlobKey(attachmentId, 'raw'));
      }
    });

    // On upload error, mark as failed for retry
    uppy.on('transloadit:assembly-error', async (assembly, error) => {
      const errorMessage = error?.message || 'Upload failed';
      for (const upload of assembly.uploads || []) {
        const attachmentId = uploadAttachmentId(upload);
        if (attachmentId) await attachmentStorage.markFailed(makeBlobKey(attachmentId, 'raw'), errorMessage);
      }
    });
  }

  return uppy;
};

/**
 * The attachment id an assembly upload carries. Minted in `onBeforeFileAdded` and round-tripped
 * through Transloadit as `user_meta`, so it is the same id the blob was stored under.
 */
const uploadAttachmentId = (upload: { user_meta?: Record<string, unknown> }): string | undefined => {
  const id = upload.user_meta?.attachmentId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
};

const onBeforeFileAdded = (file: CustomUppyFile) => {
  // Simplify Uppy's own file ID (it only has to be unique within this Uppy instance).
  file.id = nanoid();
  // Mint the attachment id up front so the local blob is stored under the id its row will get.
  // Uppy passes file meta to Transloadit as `user_meta`, so it survives the round trip and
  // `parseUploadedAttachments` reuses it to keep the upload and attachment IDs aligned.
  file.meta.attachmentId = generateId();
  return file;
};
