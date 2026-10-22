import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type UploadTemplateId } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { createBaseTransloaditUppy, registerUppyPlugins } from '~/modules/common/uploader/helpers/uppy-helpers';
import type { CustomUppy, CustomUppyOpt, UploadedUppyFile } from '~/modules/common/uploader/types';
import { uploader, useUploader } from '~/modules/common/uploader/use-uploader';

const uppyRestrictions = appConfig.uppy.defaultRestrictions;

export function useUploadUppy() {
  const { t } = useTranslation();
  const uploaderData = useUploader((state) => state.uploaderConfig);

  const [uppy, setUppy] = useState<CustomUppy | null>(null);

  useEffect(() => {
    if (!uploaderData) return;

    let isMounted = true;
    let localUppy: CustomUppy | null = null;

    const { templateId, organizationId, restrictions, plugins = [], statusEventHandler = {} } = uploaderData;

    const isOnline = onlineManager.isOnline();
    const isUploadFullyEnabled = appConfig.has.uploadEnabled && isOnline;

    const allowedFileTypes = isOnline ? (restrictions?.allowedFileTypes ?? uppyRestrictions.allowedFileTypes) : ['image/*'];

    const uppyOptions: CustomUppyOpt = { restrictions: { ...uppyRestrictions, ...restrictions, allowedFileTypes } };

    const initializeUppy = async () => {
      try {
        localUppy = await createBaseTransloaditUppy(uppyOptions, { templateId, organizationId });

        localUppy
          .on('file-editor:complete', (file) => {
            console.info('File editor complete:', file);
          })
          .on('upload', (_uploadId, files) => {
            console.info('Upload started:', files);
          })
          .on('error', (error) => {
            console.error('Upload error:', error);
            statusEventHandler.onError?.(error);
          })
          .on('transloadit:complete', (assembly) => {
            // A failed assembly reports through the error event
            if (assembly.error) return;
            console.info('Upload complete:', assembly);
            // Inside the chain, so a handler that throws at once also reaches the toast
            Promise.resolve()
              .then(() => statusEventHandler.onComplete?.(assembly.results as UploadedUppyFile<UploadTemplateId>))
              .catch((err) => {
                console.error('onComplete handler failed:', err);
                toaster.error(t('c:upload_failed'));
              });
          });

        const sourcePlugins = isUploadFullyEnabled ? plugins : plugins.filter((plugin) => plugin !== 'audio' && plugin !== 'screen-capture');
        registerUppyPlugins(localUppy, sourcePlugins, templateId);

        if (!isMounted) {
          localUppy.destroy();
          return;
        }
        setUppy(localUppy);
      } catch (err) {
        console.error('Failed to initialize upload:', err);
        if (!isMounted) return;
        toaster.error(t('c:upload_failed'));
        uploader.getState().remove();
      }
    };

    initializeUppy();

    return () => {
      isMounted = false;
      setUppy(null);
      if (localUppy) localUppy.destroy();
    };
  }, [uploaderData]);

  return { uppy, uploaderData };
}
