import { onlineManager } from '@tanstack/react-query';
import { Uppy, type UppyFile, type UppyOptions } from '@uppy/core';
import Tus from '@uppy/tus';
import { config } from 'config';
import type { LocalFile, UppyBody, UppyMeta } from '~/lib/imado/types';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import { nanoid } from '~/utils/nanoid';

/**
 * Transforms an uploaded file by constructing its final URL.
 *
 * @param file - Fle object containing metadata and upload details.
 * @param token - JWT token used to extract the user's subscription info.
 * @param isPublic - Flag indicating whether the file is public or private.
 * @returns An object containing the file and its final URL.
 */
export const transformUploadedFile = (file: UppyFile<UppyMeta, UppyBody>, token: string, isPublic: boolean) => {
  // Define the root URL for the uploaded files (public or private CDN)
  const rootUrl = isPublic ? config.publicCDNUrl : config.privateCDNUrl;
  const { sub } = readJwt(token);
  const uploadKey = file.uploadURL?.split('/').pop();
  const url = new URL(`${rootUrl}/${sub}/${uploadKey}`);

  return { file, url: url.toString() };
};

const readJwt = (token: string) => JSON.parse(atob(token.split('.')[1]));

/**
 * Prepares files for offline storage and returns successfully uploaded files.
 *
 * @param files - Fle object containing metadata and upload details.
 * @returns An array of files that were successfully prepared for offline storage.
 */
export const prepareFilesForOffline = async (files: Record<string, LocalFile>) => {
  console.warn('Files will be stored offline in indexedDB.');

  // Save files to local storage
  await LocalFileStorage.addFiles(files);

  // Prepare files for a manual 'complete' event (successfully uploaded files)
  const successfulFiles = Object.values(files);
  return successfulFiles;
};

/**
 * Creates and initializes a new Uppy instance with provided options and configuration.
 *
 * @param uppyOptions - Configuration options for Uppy.
 * @param imadoToken - JWT token to authenticate requests for uploading files via Tus.
 * @param isPublic -  Flag indicating whether file is public or private.
 * @returns A new Uppy instance configured with specified options and Tus uploader.
 */
export const createBaseTusUppy = (uppyOptions: UppyOptions<UppyMeta, UppyBody>, imadoToken: string, isPublic: boolean) => {
  return new Uppy({
    ...uppyOptions,
    meta: { public: isPublic },
    onBeforeFileAdded,
  }).use(Tus, getTusConfig(imadoToken));
};

const onBeforeFileAdded = (file: UppyFile<UppyMeta, UppyBody>) => {
  // Simplify file ID and add content type to meta
  file.id = nanoid();
  file.meta = { ...file.meta, contentType: file.type, offlineUploaded: !onlineManager.isOnline() };
  return file;
};

const getTusConfig = (token: string) => ({
  endpoint: config.tusUrl,
  removeFingerprintOnSuccess: true,
  headers: { authorization: `Bearer ${token}` },
});
