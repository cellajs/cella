import { onlineManager } from '@tanstack/react-query';
import Audio from '@uppy/audio';
import type { Body, Meta } from '@uppy/core';
import ImageEditor from '@uppy/image-editor';
import ScreenCapture from '@uppy/screen-capture';
import Webcam, { type WebcamOptions } from '@uppy/webcam';
import { type UploadTemplateId, config } from 'config';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from '~/modules/common/toaster';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import { getImageEditorOptions } from '~/modules/common/uploader/helpers/image-editor-options';
import type { CustomUppy, CustomUppyOpt, UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';

const uppyRestrictions = config.uppy.defaultRestrictions;

export function useUploadUppy() {
  const { t } = useTranslation();
  const uploaderData = useUploader((state) => state.uploaderConfig);

  const [uppy, setUppy] = useState<CustomUppy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uploaderData || !config.has.s3) return;

    let isMounted = true;
    let localUppy: CustomUppy | null = null;

    const { isPublic, templateId = 'attachment', organizationId, restrictions, plugins = [], statusEventHandler = {} } = uploaderData;

    const uppyOptions: CustomUppyOpt = {
      restrictions: {
        ...uppyRestrictions,
        minFileSize: null,
        minNumberOfFiles: null,
        ...restrictions,
        requiredMetaFields: restrictions?.requiredMetaFields ?? [],
      },
    };

    const initializeUppy = async () => {
      try {
        localUppy = await createBaseTransloaditUppy(uppyOptions, { public: isPublic, templateId, organizationId });

        localUppy
          .on('files-added', () => {
            if (onlineManager.isOnline() && !config.has.s3) toaster(t('common:file_upload_warning'), 'warning');
          })
          .on('file-editor:complete', (file) => {
            console.info('File editor complete:', file);
            statusEventHandler.onFileEditorComplete?.(file);
          })
          .on('upload', (uploadId, files) => {
            console.info('Upload started:', files);
            statusEventHandler.onUploadStart?.(uploadId, files);
          })
          .on('error', (error) => {
            console.error('Upload error:', error);
            statusEventHandler.onError?.(error);
            throw new Error(error.message ?? 'Upload error');
          })
          .on('transloadit:complete', (assembly) => {
            if (assembly?.error) throw new Error(assembly?.error);
            console.info('Upload complete:', assembly);
            statusEventHandler.onComplete?.(assembly.results as UploadedUppyFile<UploadTemplateId>);
          });
        // TODO(UPPYREFACTOR)
        // .on('is-online', async () => {
        //       // When back online, retry uploads
        //       if (!config.has.imado) return;

        //       // Get files that was uploaded during offline
        //       const offlineUploadedFiles = imadoUppy.getFiles().filter((el) => el.meta.offlineUploaded);
        //       if (!offlineUploadedFiles.length) return;

        //       // Get a new upload token
        //       const imadoToken = await getUploadToken(type, opts.templateId, { public: isPublic, organizationId: opts.organizationId });
        //       if (!imadoToken) return;

        //       imadoUppy.destroy(); // Destroy the current Uppy instance to restart

        //       // Initialize a new Uppy instance to retry the upload
        //       const retryImadoUppy = createBaseTransloaditUppy(uppyOptions, imadoToken, isPublic);

        //       // Add files to the new Uppy instance
        //       const validFiles = offlineUploadedFiles.map((file) => ({ ...file, name: file.name || `${file.type}-${file.id}` }));
        //       retryImadoUppy.addFiles(validFiles);

        //       // Upload the files
        //       retryImadoUppy.upload().then(async (result) => {
        //         if (!result || !('transloadit' in result)) return;

        //         const transloadits = result.transloadit as AssemblyResponse[];
        //         const assembly = transloadits[0];
        //         if (assembly.error) return;

        //         // Clean up offline files from IndexedDB
        //         const ids = offlineUploadedFiles.map((el) => el.id);
        //         await LocalFileStorage.removeFiles(ids);
        //         console.info('🗑️ Successfully uploaded files removed from IndexedDB.');

        //         // Notify the event handler for retry completion
        //         opts.statusEventHandler?.onRetrySuccess?.(assembly.results as UploadedUppyFile<UploadTemplateId>, ids);
        //       });
        //     });
        // Plugin Options
        const imageEditorOptions = getImageEditorOptions(templateId);
        const webcamOptions: WebcamOptions<Meta, Body> = {
          videoConstraints: { width: 1280, height: 720 },
          preferredVideoMimeType: 'video/webm;codecs=vp9',
        };

        if (['cover', 'avatar'].includes(templateId)) webcamOptions.modes = ['picture'];

        // Plugin Registration
        if (plugins.includes('webcam')) localUppy.use(Webcam, webcamOptions);
        if (plugins.includes('image-editor')) localUppy.use(ImageEditor, imageEditorOptions);
        if (plugins.includes('audio')) localUppy.use(Audio);
        if (plugins.includes('screen-capture')) localUppy.use(ScreenCapture, { preferredVideoMimeType: 'video/webm;codecs=vp9' });

        if (!isMounted) {
          localUppy.destroy();
          return;
        }
        setUppy(localUppy);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize upload';
        setError(message);
      }
    };

    initializeUppy();

    return () => {
      isMounted = false;
      setUppy(null);
      if (localUppy) localUppy.destroy();
    };
  }, [uploaderData]);

  return { uppy, error, uploaderData };
}
