import Audio from '@uppy/audio';
import type { Uppy, UppyOptions } from '@uppy/core';
import ImageEditor, { type ImageEditorOptions } from '@uppy/image-editor';
import { Dashboard } from '@uppy/react';
import ScreenCapture from '@uppy/screen-capture';
import Webcam, { type WebcamOptions } from '@uppy/webcam';
import { config } from 'config';
import { useEffect, useState } from 'react';
import { ImadoUppy } from '~/lib/imado';
import type { UploadedUppyFile, UppyBody, UppyMeta } from '~/lib/imado/types';
import { getImageEditorOptions } from '~/modules/attachments/upload/image-editor-options';
import { useUIStore } from '~/store/ui';

import '@uppy/audio/dist/style.css';
import '@uppy/dashboard/dist/style.min.css';
import '@uppy/image-editor/dist/style.css';
import '@uppy/screen-capture/dist/style.css';
import '@uppy/webcam/dist/style.css';
import '~/modules/attachments/upload/uppy.css';

export interface UploadUppyProps {
  uploadType: 'organization' | 'personal';
  isPublic: boolean;
  plugins?: ('webcam' | 'image-editor' | 'audio' | 'screen-capture' | string)[];
  restrictions?: Partial<UppyOptions<UppyMeta, UppyBody>['restrictions']>;
  imageMode?: 'cover' | 'avatar' | 'attachment';
  organizationId?: string;
  callback?: (result: UploadedUppyFile[]) => void;
  onRetrySuccessCallback?: (result: UploadedUppyFile[], previousIds: string[]) => void;
}

const uppyRestrictions = config.uppy.defaultRestrictions;

// Here we init imadoUppy, an enriched Uppy instance that we use to upload files.
// For more info in Imado, see: https://imado.eu/
// For more info on Uppy and its APIs, see: https://uppy.io/docs/

export const UploadUppy = ({
  uploadType,
  isPublic,
  organizationId,
  restrictions = {},
  plugins = [],
  imageMode = 'attachment',
  callback,
  onRetrySuccessCallback,
}: UploadUppyProps) => {
  const [uppy, setUppy] = useState<Uppy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mode = useUIStore((state) => state.mode);

  const uppyOptions: UppyOptions<UppyMeta, UppyBody> = {
    restrictions: {
      ...uppyRestrictions,
      minFileSize: null,
      minNumberOfFiles: null,
      ...restrictions,
      requiredMetaFields: restrictions.requiredMetaFields ?? [],
    },
  };

  useEffect(() => {
    const initializeUppy = async () => {
      try {
        const imadoUppy = await ImadoUppy(uploadType, uppyOptions, {
          public: isPublic,
          organizationId: organizationId,
          statusEventHandler: {
            onComplete: (mappedResult) => {
              if (callback) callback(mappedResult);
            },
            onRetrySuccess(results, localStoreIds) {
              if (onRetrySuccessCallback) onRetrySuccessCallback(results, localStoreIds);
            },
            onFileEditorComplete: () => {
              if (['cover', 'avatar'].includes(imageMode)) imadoUppy.upload();
            },
          },
        });

        const imageEditorOptions: ImageEditorOptions = getImageEditorOptions(imageMode);
        const webcamOptions: WebcamOptions<UppyMeta, UppyBody> = {
          videoConstraints: { width: 1280, height: 720 },
          preferredVideoMimeType: 'video/webm;codecs=vp9',
        };

        if (['cover', 'avatar'].includes(imageMode)) {
          webcamOptions.modes = ['picture'];
        }

        if (plugins.includes('webcam')) imadoUppy.use(Webcam, webcamOptions);
        if (plugins.includes('image-editor')) imadoUppy.use(ImageEditor, imageEditorOptions);
        if (plugins.includes('audio')) imadoUppy.use(Audio);
        if (plugins.includes('screen-capture')) imadoUppy.use(ScreenCapture, { preferredVideoMimeType: 'video/webm;codecs=vp9' });

        setUppy(imadoUppy);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize upload';
        setError(message);
      }
    };

    initializeUppy();
  }, []);

  // Catch and display errors
  if (error) return <div className="text-red-600 py-3">{error}</div>;

  return (
    <>
      {uppy && (
        <Dashboard
          uppy={uppy}
          autoOpen={['cover', 'avatar'].includes(imageMode) ? 'imageEditor' : null}
          width="100%"
          height="400px"
          theme={mode}
          proudlyDisplayPoweredByUppy={false}
        />
      )}
    </>
  );
};

export default UploadUppy;
