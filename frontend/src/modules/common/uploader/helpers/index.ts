import { onlineManager } from '@tanstack/react-query';
import { Uppy } from '@uppy/core';
import Transloadit from '@uppy/transloadit';
import { config } from 'config';
import { prepareFilesForOffline } from '~/modules/common/uploader/helpers/prepare-for-offline';
import type { CustomUppy, CustomUppyFile, CustomUppyOpt } from '~/modules/common/uploader/types';
import { type UploadTokenQuery, getUploadToken } from '~/modules/me/api';
import { cleanFileName } from '~/utils/clean-file-name';
import { nanoid } from '~/utils/nanoid';

/**
 * Creates and initializes a new Uppy instance with provided options and configuration.
 *
 * @param uppyOptions - Configuration options for Uppy (restrictions, plugins, etc.).
 * @param token - JWT token containing Transloadit upload parameters and signature.
 * @param isPublic - Flag indicating whether the uploaded files should be publicly accessible.
 * @param withTransloadit - Optional flag to control whether to integrate Transloadit plugin. Defaults to true.
 * @returns A new Uppy instance configured with the specified options, and Transloadit if enabled.
 */
export const createBaseTransloaditUppy = async (uppyOptions: CustomUppyOpt, tokenQuery: UploadTokenQuery): Promise<CustomUppy> => {
  const uppy = new Uppy({
    ...uppyOptions,
    meta: { public: tokenQuery.public, offlineUploaded: !onlineManager.isOnline() },
    onBeforeFileAdded,
    onBeforeUpload: (files) => {
      // Determine if we can upload based on online status and s3 configuration
      const canUpload = onlineManager.isOnline() && config.has.s3;

      // Clean up file names
      for (const file of Object.values(files)) {
        const cleanName = cleanFileName(file.name || 'file');
        file.name = cleanName;
        file.meta.name = cleanName;
      }

      if (canUpload) return true;
      // If not online, prepare the files for offline storage and emit transloadit:complete event
      prepareFilesForOffline(files, tokenQuery).then((assembly) => uppy.emit('transloadit:complete', assembly));
      return config.has.s3; // Prevent upload if s3 is unavailable
    },
  });

  try {
    const token = await getUploadToken(tokenQuery);
    if (!token) throw new Error('Failed to get upload token');

    const { params, signature } = token;

    uppy.use(Transloadit, {
      waitForEncoding: true, // Wait for server-side encoding to finish before completing the upload
      alwaysRunAssembly: true, // Always create a Transloadit Assembly even if no files changed
      assemblyOptions: { params, signature }, // Transloadit template params & signature to authenticate request
    });

    return uppy;
  } catch (err) {
    // Too allow uppy dialog offline upload
    if (err instanceof Error && err.message === 'Failed to fetch' && !onlineManager.isOnline()) return uppy;
    throw new Error('Failed to get upload token');
  }
};

const onBeforeFileAdded = (file: CustomUppyFile) => {
  // Simplify file ID and add content type to meta
  file.id = nanoid();
  return file;
};
