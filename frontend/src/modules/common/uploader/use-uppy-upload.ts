import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { createUppy, registerUppyPlugins } from '~/modules/common/uploader/helpers/uppy-helpers';
import { type CustomUppy, type CustomUppyOptions, uploadResultsOf } from '~/modules/common/uploader/types';
import { uploader, useUploader } from '~/modules/common/uploader/use-uploader';

const defaultRestrictions = appConfig.uppy.defaultRestrictions;

export function useUppyUpload() {
  const { t } = useTranslation();
  const uploadData = useUploader((state) => state.uploadData);

  const [uppy, setUppy] = useState<CustomUppy | null>(null);

  useEffect(() => {
    if (!uploadData) return;

    let isMounted = true;
    let localUppy: CustomUppy | null = null;

    const { templateId, organizationId, restrictions, plugins = [], onComplete } = uploadData;

    const isOnline = onlineManager.isOnline();
    const isUploadFullyEnabled = appConfig.has.uploadEnabled && isOnline;

    const allowedFileTypes = isOnline ? (restrictions?.allowedFileTypes ?? defaultRestrictions.allowedFileTypes) : ['image/*'];

    const uppyOptions: CustomUppyOptions = { restrictions: { ...defaultRestrictions, ...restrictions, allowedFileTypes } };

    const sourcePlugins = isUploadFullyEnabled ? plugins : plugins.filter((plugin) => plugin !== 'audio' && plugin !== 'screen-capture');

    const initializeUppy = async () => {
      try {
        localUppy = await createUppy(uppyOptions, { templateId, organizationId });

        localUppy
          .on('error', (error) => {
            console.error('Upload error:', error);
          })
          .on('transloadit:complete', (assembly) => {
            // A failed assembly reports through the error event
            if (assembly.error) return;
            // Inside the chain, so a handler that throws at once also reaches the toast
            Promise.resolve()
              .then(() => onComplete?.(uploadResultsOf(assembly)))
              .catch((error) => {
                console.error('onComplete handler failed:', error);
                toaster.error(t('c:upload_failed'));
              });
          });

        registerUppyPlugins(localUppy, sourcePlugins, templateId);

        if (!isMounted) {
          localUppy.destroy();
          return;
        }
        setUppy(localUppy);
      } catch (error) {
        console.error('Failed to initialize upload:', error);
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
  }, [uploadData]);

  return { uppy, uploadData };
}
