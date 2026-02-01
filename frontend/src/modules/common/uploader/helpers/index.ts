import * as Sentry from '@sentry/react';
import { onlineManager } from '@tanstack/react-query';
import { Uppy } from '@uppy/core';
import Transloadit from '@uppy/transloadit';
import { appConfig } from 'config';
import { getUploadToken, type UploadToken } from '~/api.gen';
import type { UploadContext } from '~/modules/attachment/dexie/attachments-db';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { prepareFilesForOffline } from '~/modules/common/uploader/helpers/prepare-for-offline';
import type { CustomUppy, CustomUppyFile, CustomUppyOpt } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';
import { cleanFileName } from '~/utils/clean-file-name';
import { nanoid } from '~/utils/nanoid';

/**
 * Creates and initializes a new Uppy instance with local-first upload support.
 *
 * Flow:
 * 1. Get upload token from backend
 * 2. If Transloadit configured (params/signature present): use cloud upload
 * 3. If Transloadit not configured (params=null): store locally in IndexedDB
 * 4. If offline: queue for later upload (pending status)
 *
 * The local blob is always stored first, then synced to cloud when available.
 */
export const createBaseTransloaditUppy = async (
  uppyOptions: CustomUppyOpt,
  tokenQuery: UploadTokenQuery,
): Promise<CustomUppy> => {
  // Get upload token early to determine cloud availability
  let cloudToken: UploadToken | null = null;
  let hasCloudUpload = false;

  try {
    if (onlineManager.isOnline()) {
      cloudToken = await getUploadToken({ query: tokenQuery });
      // Cloud upload only available if Transloadit is configured
      hasCloudUpload = !!(cloudToken?.params && cloudToken?.signature);
    }
  } catch (err) {
    // Offline or failed to get token - will use local storage
    if (!(err instanceof Error && err.message.includes('Failed to fetch'))) {
      Sentry.captureException(err);
    }
    cloudToken = null;
    hasCloudUpload = false;
  }

  const uppy = new Uppy({
    ...uppyOptions,
    meta: {
      public: tokenQuery.public,
      bucketName: tokenQuery.public ? appConfig.s3.publicBucket : appConfig.s3.privateBucket,
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

    // Determine sync status based on cloud availability
    // - 'pending': Cloud available, queue for sync
    // - 'local-only': No cloud configured, permanent local storage
    const isOnline = onlineManager.isOnline();
    const syncStatus = hasCloudUpload ? 'pending' : 'local-only';

    // If cloud upload not available, store locally and emit completion
    if (!hasCloudUpload) {
      const assembly = await prepareFilesForOffline(filesMap, tokenQuery, syncStatus);
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
        public: tokenQuery.public,
      };
      for (const file of uploadFiles) {
        await attachmentStorage.storeUploadBlob(file, organizationId, 'pending', uploadContext);
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

    // On successful cloud upload, mark local blobs as synced
    uppy.on('transloadit:complete', async (assembly) => {
      // Skip offline assemblies (already marked correctly)
      if (assembly.assembly_id?.startsWith('offline_')) return;

      if (assembly.ok === 'ASSEMBLY_COMPLETED') {
        for (const upload of assembly.uploads || []) {
          const fileId = upload.original_id || upload.id;
          // Handle both string and string[] types
          const fileIdStr = Array.isArray(fileId) ? fileId[0] : fileId;
          if (fileIdStr) {
            await attachmentStorage.markSynced(fileIdStr);
          }
        }
      }
    });

    // On upload error, mark as failed for retry
    uppy.on('transloadit:assembly-error', async (assembly, error) => {
      const errorMessage = error?.message || 'Upload failed';
      for (const upload of assembly.uploads || []) {
        const fileId = upload.original_id || upload.id;
        // Handle both string and string[] types
        const fileIdStr = Array.isArray(fileId) ? fileId[0] : fileId;
        if (fileIdStr) {
          await attachmentStorage.markFailed(fileIdStr, errorMessage);
        }
      }
    });
  }

  return uppy;
};

const onBeforeFileAdded = (file: CustomUppyFile) => {
  // Simplify file ID and add content type to meta
  file.id = nanoid();
  return file;
};
