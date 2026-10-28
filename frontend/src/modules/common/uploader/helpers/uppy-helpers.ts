import { onlineManager } from '@tanstack/react-query';
import Audio from '@uppy/audio';
import { type Body, type Meta, Uppy } from '@uppy/core';
import ImageEditor from '@uppy/image-editor';
import ScreenCapture from '@uppy/screen-capture';
import Transloadit, { COMPANION_ALLOWED_HOSTS, COMPANION_URL } from '@uppy/transloadit';
import Url from '@uppy/url';
import Webcam, { type WebcamOptions } from '@uppy/webcam';
import { t } from 'i18next';
// biome-ignore lint/style/noRestrictedImports: runtime token fetcher inside Uppy assembly callback; not eligible for a React Query hook.
import { getUploadToken, type UploadToken } from 'sdk';
import { appConfig, type UploadTemplateId } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { uploadStorage } from 'shared/utils/upload-visibility';
import { makeBlobKey, type UploadStatus } from '~/modules/attachment/offline/attachments-db';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { freshAssemblyOptions } from '~/modules/common/uploader/helpers/fresh-assembly-options';
import { getImageEditorOptions, isImageTemplate } from '~/modules/common/uploader/helpers/image-editor-options';
import { prepareFilesForOffline, storeUploadBlobs } from '~/modules/common/uploader/helpers/prepare-for-offline';
import type { CustomUppy, CustomUppyFile, CustomUppyOptions, Plugins } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';
import { cleanFileName } from '~/utils/clean-file-name';

/**
 * Local-first Uppy instance: the blob is stored in IndexedDB first, then uploaded when Transloadit
 * is configured and the app is online. Offline uploads queue as pending; a public template refuses
 * files while it cannot upload.
 */
export const createUppy = async (uppyOptions: CustomUppyOptions, tokenQuery: UploadTokenQuery): Promise<CustomUppy> => {
  let cloudToken: UploadToken | null = null;
  let hasCloudUpload = false;
  // Only a server without cloud storage files the upload as local-only; offline or after a failed token request it waits as pending.
  let localStatus: UploadStatus = appConfig.has.uploadEnabled ? 'pending' : 'local-only';

  try {
    if (appConfig.has.uploadEnabled && onlineManager.isOnline()) {
      cloudToken = await getUploadToken({ query: tokenQuery });
      // Transloadit is configured only when both params and signature come back
      hasCloudUpload = !!(cloudToken?.params && cloudToken?.signature);
      if (!hasCloudUpload) localStatus = 'local-only';
    }
  } catch (error) {
    if (!(error instanceof Error && error.message.includes('Failed to fetch'))) {
      console.error('Failed to get upload token:', error);
    }
  }

  // Others read a public image from the public bucket, so a copy on this device serves no one
  const isPublic = uploadStorage(tokenQuery.templateId).publicBucket;
  const refusesPublic = () => {
    if (!isPublic || (hasCloudUpload && onlineManager.isOnline())) return false;
    if (onlineManager.isOnline()) toaster.error(t('c:restrict_image_upload'));
    else toastOffline();
    return true;
  };

  const uppy = new Uppy({
    ...uppyOptions,
    meta: { offlineUploaded: !hasCloudUpload },
    onBeforeFileAdded: (file) => (refusesPublic() ? false : onBeforeFileAdded(file)),
    onBeforeUpload: (files) => {
      // The connection can drop between adding a file and uploading it
      if (refusesPublic()) return false;
      for (const file of Object.values(files)) {
        const cleanName = cleanFileName(file.name || 'file');
        file.name = cleanName;
        file.meta.name = cleanName;
      }
      return files;
    },
  });

  uppy.on('upload', async (_uploadId, uploadFiles) => {
    // With cloud upload, localStatus is 'pending': offline the files wait for the connection
    if (!hasCloudUpload || !onlineManager.isOnline()) {
      const assembly = await prepareFilesForOffline(uploadFiles, tokenQuery, localStatus);
      uppy.cancelAll();
      uppy.emit('transloadit:complete', assembly);
      return;
    }

    // Store the blob before uploading so a failed upload can retry from IndexedDB
    const { organizationId, templateId } = tokenQuery;
    if (organizationId) await storeUploadBlobs(uploadFiles, organizationId, templateId, 'pending');
  });

  if (hasCloudUpload) {
    // The token above only tells whether cloud upload is on: the dialog may stay open past its expiry.
    uppy.use(Transloadit, { waitForEncoding: true, alwaysRunAssembly: true, assemblyOptions: () => freshAssemblyOptions(tokenQuery) });

    uppy.on('transloadit:complete', async (assembly) => {
      // Skip offline assemblies (already marked correctly)
      if (assembly.assembly_id?.startsWith('offline_')) return;
      if (assembly.ok !== 'ASSEMBLY_COMPLETED') return;

      for (const upload of assembly.uploads || []) {
        const attachmentId = attachmentIdOf(upload);
        if (attachmentId) await attachmentStorage.markUploaded(makeBlobKey(attachmentId, 'raw'));
      }
    });

    uppy.on('transloadit:assembly-error', async (assembly, error) => {
      const errorMessage = error?.message || 'Upload failed';
      for (const upload of assembly.uploads || []) {
        const attachmentId = attachmentIdOf(upload);
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
const attachmentIdOf = (upload: { user_meta?: Record<string, unknown> }): string | undefined => {
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

const webmVideo = 'video/webm;codecs=vp9';

/** Adds the named source plugins. An image template takes webcam pictures only, and its editor crops to the template's aspect ratio. */
export const registerUppyPlugins = (uppy: CustomUppy, plugins: Plugins, templateId: UploadTemplateId) => {
  if (plugins.includes('webcam')) {
    const webcamOptions: WebcamOptions<Meta, Body> = { videoConstraints: { width: 1280, height: 720 }, preferredVideoMimeType: webmVideo };
    if (isImageTemplate(templateId)) webcamOptions.modes = ['picture'];
    uppy.use(Webcam, webcamOptions);
  }
  if (plugins.includes('image-editor')) uppy.use(ImageEditor, getImageEditorOptions(templateId));
  if (plugins.includes('audio')) uppy.use(Audio);
  if (plugins.includes('url')) uppy.use(Url, { companionUrl: COMPANION_URL, companionAllowedHosts: COMPANION_ALLOWED_HOSTS });
  if (plugins.includes('screen-capture')) uppy.use(ScreenCapture, { preferredVideoMimeType: webmVideo });
};
