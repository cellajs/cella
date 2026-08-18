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
 * Local-first Uppy instance: the blob is stored in IndexedDB first, then uploaded when Transloadit
 * is configured and the app is online. Offline uploads queue as pending.
 */
export const createBaseTransloaditUppy = async (
  uppyOptions: CustomUppyOpt,
  tokenQuery: UploadTokenQuery,
): Promise<CustomUppy> => {
  let cloudToken: UploadToken | null = null;
  let hasCloudUpload = false;

  try {
    // Without uploadEnabled all files stay in IndexedDB
    if (appConfig.has.uploadEnabled && onlineManager.isOnline()) {
      cloudToken = await getUploadToken({ query: tokenQuery });
      // Transloadit is configured only when both params and signature come back
      hasCloudUpload = !!(cloudToken?.params && cloudToken?.signature);
    }
  } catch (err) {
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
      for (const file of Object.values(files)) {
        const cleanName = cleanFileName(file.name || 'file');
        file.name = cleanName;
        file.meta.name = cleanName;
      }
      return files;
    },
  });

  uppy.on('upload', async (_uploadId, uploadFiles) => {
    const filesMap = Object.fromEntries(uploadFiles.map((f) => [f.id, f]));

    // 'pending' = cloud available, queue for upload; 'local-only' = no cloud, permanent local storage.
    const isOnline = onlineManager.isOnline();
    const uploadStatus = hasCloudUpload ? 'pending' : 'local-only';

    if (!hasCloudUpload) {
      const assembly = await prepareFilesForOffline(filesMap, tokenQuery, uploadStatus);
      uppy.cancelAll();
      uppy.emit('transloadit:complete', assembly);
      return;
    }

    if (!isOnline) {
      const assembly = await prepareFilesForOffline(filesMap, tokenQuery, 'pending');
      uppy.cancelAll();
      uppy.emit('transloadit:complete', assembly);
      return;
    }

    // Store the blob before uploading so a failed upload can retry from IndexedDB
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

  if (hasCloudUpload && cloudToken?.params && cloudToken?.signature) {
    uppy.use(Transloadit, {
      waitForEncoding: true,
      alwaysRunAssembly: true,
      assemblyOptions: {
        params: cloudToken.params,
        signature: cloudToken.signature,
      },
    });

    uppy.on('transloadit:complete', async (assembly) => {
      // Skip offline assemblies (already marked correctly)
      if (assembly.assembly_id?.startsWith('offline_')) return;
      if (assembly.ok !== 'ASSEMBLY_COMPLETED') return;

      for (const upload of assembly.uploads || []) {
        const attachmentId = uploadAttachmentId(upload);
        if (attachmentId) await attachmentStorage.markUploaded(makeBlobKey(attachmentId, 'raw'));
      }
    });

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
  // Mint the attachment id up front so the local blob is stored under the id its row will get
  file.meta.attachmentId = generateId();
  return file;
};
