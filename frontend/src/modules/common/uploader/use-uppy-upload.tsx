import { onlineManager } from '@tanstack/react-query';
import Audio from '@uppy/audio';
import type { Uppy } from '@uppy/core';
import ImageEditor, { type ImageEditorOptions } from '@uppy/image-editor';
import ScreenCapture from '@uppy/screen-capture';
import Webcam from '@uppy/webcam';
import { type UploadTemplateId, config } from 'config';
import { useEffect, useState } from 'react';
import { getImageEditorOptions } from '~/modules/attachments/upload/image-editor-options';
import { toaster } from '~/modules/common/toaster';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import type { CustomUppyOpt, CustomWebcamOpt, UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';

const uppyRestrictions = config.uppy.defaultRestrictions;

export function useUploadUppy() {
  const uploaderConfig = useUploader((state) => state.uploaderConfig);

  const [uppy, setUppy] = useState<Uppy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOnline = onlineManager.isOnline();
  const canUpload = isOnline && config.has.imado;

  useEffect(() => {
    let mounted = true;

    if (!uploaderConfig || !canUpload) return;

    const { isPublic, templateId = 'attachment', organizationId, restrictions, plugins = [], statusEventHandler = {} } = uploaderConfig;

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
        const imadoUppy = await createBaseTransloaditUppy(uppyOptions, {
          public: isPublic,
          templateId,
          organization: organizationId,
        });

        imadoUppy
          .on('files-added', () => {
            if (isOnline && !config.has.imado) toaster('File upload warning: service unavailable', 'warning');
          })
          .on('file-editor:complete', (file) => {
            statusEventHandler.onFileEditorComplete?.(file);
          })
          .on('upload', (uploadId, files) => {
            statusEventHandler.onUploadStart?.(uploadId, files);
          })
          .on('error', (error) => {
            statusEventHandler.onError?.(error);
            throw new Error(error.message ?? 'Upload error');
          })
          .on('transloadit:complete', (assembly) => {
            if (assembly?.error) throw new Error(assembly?.error);

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
        const imageEditorOptions: ImageEditorOptions = getImageEditorOptions(templateId);
        const webcamOptions: CustomWebcamOpt = {
          videoConstraints: { width: 1280, height: 720 },
          preferredVideoMimeType: 'video/webm;codecs=vp9',
        };

        if (['cover', 'avatar'].includes(templateId)) webcamOptions.modes = ['picture'];

        // Plugin Registration
        if (plugins.includes('webcam')) imadoUppy.use(Webcam, webcamOptions);
        if (plugins.includes('image-editor')) imadoUppy.use(ImageEditor, imageEditorOptions);
        if (plugins.includes('audio')) imadoUppy.use(Audio);
        if (plugins.includes('screen-capture')) imadoUppy.use(ScreenCapture, { preferredVideoMimeType: 'video/webm;codecs=vp9' });

        if (mounted) setUppy(imadoUppy);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize upload';
        if (mounted) setError(message);
      }
    };

    initializeUppy();

    return () => {
      mounted = false;
      if (uppy) {
        uppy.destroy(); // Ensures events and memory are cleared
        setUppy(null);
      }
    };
  }, [uploaderConfig, canUpload]);

  return { uppy, error };
}
