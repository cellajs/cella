import { onlineManager } from '@tanstack/react-query';
import { Uppy, type UppyFile, type UppyOptions } from '@uppy/core';
import Transloadit, { type AssemblyResponse } from '@uppy/transloadit';
import type { UploadTemplateId } from 'config';
import type { LocalFile, UploadTokenData, UppyBody, UppyMeta } from '~/lib/imado/types';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import { nanoid } from '~/utils/nanoid';
import { uploadTemplates } from '#/lib/transloadit/templates';

/**
 * Prepares files for offline storage and returns successfully uploaded files.
 *
 * @param files - Fle object containing metadata and upload details.
 * @returns An array of files that were successfully prepared for offline storage.
 */
export const prepareFilesForOffline = async (files: Record<string, LocalFile>, templateId: UploadTemplateId) => {
  console.warn('Files will be stored offline in indexedDB.');

  const template = uploadTemplates[templateId];
  const templateKey = template.use[0];

  // Save files to local storage
  await LocalFileStorage.addFiles(files);

  // Prepare files for a manual 'complete' event (successfully uploaded files)
  const localFiles = Object.values(files).map((el) => ({
    id: el.id,
    size: el.size,
    type: el.type,
    mime: el.meta.contentType,
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

/**
 * Creates and initializes a new Uppy instance with provided options and configuration.
 *
 * @param uppyOptions - Configuration options for Uppy (restrictions, plugins, etc.).
 * @param imadoToken - JWT token containing Transloadit upload parameters and signature.
 * @param isPublic - Flag indicating whether the uploaded files should be publicly accessible.
 * @param withTransloadit - Optional flag to control whether to integrate Transloadit plugin. Defaults to true.
 * @returns A new Uppy instance configured with the specified options, and Transloadit if enabled.
 */
export const createBaseTransloaditUppy = (
  uppyOptions: UppyOptions<UppyMeta, UppyBody>,
  imadoToken: UploadTokenData | undefined,
  isPublic: boolean,
  withTransloadit = true,
) => {
  const uppy = new Uppy({
    ...uppyOptions,
    meta: { public: isPublic },
    onBeforeFileAdded,
  });

  // If Transloadit integration is enabled and an upload token is available
  if (withTransloadit && imadoToken) {
    uppy.use(Transloadit, {
      waitForEncoding: true, // Wait for server-side encoding to finish before completing the upload
      alwaysRunAssembly: true, // Always create a Transloadit Assembly even if no files changed
      assemblyOptions: {
        params: imadoToken.params, // Transloadit template params
        signature: imadoToken.signature, // Signature to authenticate request
      },
    });
  }

  return uppy;
};

const onBeforeFileAdded = (file: UppyFile<UppyMeta, UppyBody>) => {
  // Simplify file ID and add content type to meta
  file.id = nanoid();
  file.meta = { ...file.meta, contentType: file.type, offlineUploaded: !onlineManager.isOnline() };
  return file;
};
