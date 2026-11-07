import { onlineManager } from '@tanstack/react-query';
import Audio from '@uppy/audio';
import { type Body, type Meta, Uppy } from '@uppy/core';
import ImageEditor, { type ImageEditorOptions } from '@uppy/image-editor';
import ScreenCapture from '@uppy/screen-capture';
import Transloadit, { type AssemblyResponse, COMPANION_ALLOWED_HOSTS, COMPANION_URL } from '@uppy/transloadit';
import Url from '@uppy/url';
import Webcam, { type WebcamOptions } from '@uppy/webcam';
import { t } from 'i18next';
// biome-ignore lint/style/noRestrictedImports: runtime token fetcher inside Uppy assembly callback; not eligible for a React Query hook.
import { getUploadToken, type UploadToken } from 'sdk';
import { appConfig, type UploadTemplateId } from 'shared';
import { uploadTemplates } from 'shared/transloadit-config';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { uploadStorage } from 'shared/utils/upload-visibility';
import slugify from 'slugify';
import { makeBlobKey, type UploadStatus } from '~/modules/attachment/offline/attachments-db';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { toaster, toastOffline } from '~/modules/common/toaster/toaster';
import { freshAssemblyOptions } from '~/modules/common/uploader/helpers/fresh-assembly-options';
import type { CustomUppy, CustomUppyFile, CustomUppyOptions, Plugins } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';

/** Slugifies the base name and keeps the extension; empty input becomes "na". */
const cleanFileName = (name: string): string => {
  const originalName = name || 'na';
  const lastDotIndex = originalName.lastIndexOf('.');
  const hasExtension = lastDotIndex !== -1;
  const baseName = hasExtension ? originalName.slice(0, lastDotIndex) : originalName;
  const extension = hasExtension ? originalName.slice(lastDotIndex) : '';
  return `${slugify(baseName, { lower: true, strict: true, replacement: '-' })}${extension}`;
};

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
    if (!(error instanceof Error && error.message.includes('Failed to fetch'))) console.error('Failed to get upload token:', error);
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

/** Stores each file's blob locally, under the id its attachment row will be created with. */
const storeUploadBlobs = async (files: CustomUppyFile[], organizationId: string, templateId: UploadTemplateId, status: UploadStatus) => {
  for (const file of files) {
    // `onBeforeFileAdded` mints the id; Uppy's own file id names no attachment.
    if (!file.meta.attachmentId) throw new Error('Upload file carries no attachment id');
    await attachmentStorage.storeUploadBlob(file, file.meta.attachmentId, organizationId, status, { templateId });
  }
};

/** Stores the files on this device, for the upload service to send once cloud storage is reachable, and answers with a completed assembly. */
const prepareFilesForOffline = async (
  files: CustomUppyFile[],
  { organizationId, templateId }: UploadTokenQuery,
  uploadStatus: UploadStatus,
): Promise<AssemblyResponse> => {
  const [resultStep] = uploadTemplates[templateId].use;

  if (!organizationId) throw new Error('organizationId required for local storage');

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

/** Templates that take one cropped image, by the aspect ratio they crop to. */
const imageAspectRatios: Partial<Record<UploadTemplateId, number>> = { avatar: 1, cover: 3 };

export const isImageTemplate = (templateId: UploadTemplateId) => templateId in imageAspectRatios;

const baseCropperOptions = {
  guides: false,
  center: false,
  movable: false,
  rotatable: false,
  scalable: false,
  zoomable: false,
  zoomOnTouch: false,
  zoomOnWheel: false,
};

const baseActions = {
  revert: false,
  rotate: false,
  granularRotate: false,
  flip: false,
  zoomIn: false,
  zoomOut: false,
  cropSquare: false,
  cropWidescreen: false,
  cropWidescreenVertical: false,
};

const getImageEditorOptions = (templateId: UploadTemplateId): ImageEditorOptions => ({
  quality: 0.9,
  actions: baseActions,
  cropperOptions: { ...baseCropperOptions, aspectRatio: imageAspectRatios[templateId] },
});

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
