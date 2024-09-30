import Audio from '@uppy/audio';
import type { Uppy, UppyFile, UppyOptions } from '@uppy/core';
import ImageEditor, { type ImageEditorOptions } from '@uppy/image-editor';
import { Dashboard } from '@uppy/react';
import ScreenCapture from '@uppy/screen-capture';
import Webcam, { type WebcamOptions } from '@uppy/webcam';
import { useEffect, useState } from 'react';
import { ImadoUppy, type UppyBody, type UppyMeta } from '~/lib/imado';
import { useThemeStore } from '~/store/theme';
import type { UploadType } from '~/types/common';

import '@uppy/audio/dist/style.css';
import '@uppy/dashboard/dist/style.min.css';
import '@uppy/image-editor/dist/style.css';
import '@uppy/screen-capture/dist/style.css';
import '@uppy/webcam/dist/style.css';
import '~/modules/common/upload/uppy.css';
import { getImageEditorOptions } from './image-editor-options';

interface UploadUppyProps {
  uploadType: UploadType;
  isPublic: boolean;
  plugins?: ('webcam' | 'image-editor' | 'audio' | 'screen-capture')[];
  uppyOptions: UppyOptions<UppyMeta, UppyBody>;
  imageMode?: 'cover' | 'avatar';
  organizationId?: string;
  callback?: (
    result: {
      file: UppyFile<UppyMeta, UppyBody>;
      url: string;
    }[],
  ) => void;
}

// Here we init imadoUppy, an enriched Uppy instance that we use to upload files.
// For more info in Imado, see: https://imado.eu/
// For more info on Uppy and its APIs, see: https://uppy.io/docs/

export const UploadUppy = ({ uploadType, isPublic, organizationId, uppyOptions, plugins = [], imageMode, callback }: UploadUppyProps) => {
  const [uppy, setUppy] = useState<Uppy | null>(null);
  const { mode } = useThemeStore();

  useEffect(() => {
    const initializeUppy = async () => {
      const imadoUppy = await ImadoUppy(uploadType, uppyOptions, {
        public: isPublic,
        organizationId: organizationId,
        statusEventHandler: {
          onComplete: (mappedResult) => {
            if (callback) {
              callback(mappedResult);
            }
          },
          onFileEditorComplete: () => {
            // If in image mode, start upload directly after editing
            if (imageMode) imadoUppy.upload();
          },
        },
      });

      const imageEditorOptions: ImageEditorOptions = getImageEditorOptions(imageMode);

      const webcamOptions: WebcamOptions<UppyMeta, UppyBody> = {
        videoConstraints: { width: 1280, height: 720 },
      };

      if (imageMode) webcamOptions.modes = ['picture'];

      // Set plugins based on plugins props
      if (plugins.includes('webcam')) imadoUppy.use(Webcam, webcamOptions);
      if (plugins.includes('image-editor')) imadoUppy.use(ImageEditor, imageEditorOptions);
      if (plugins.includes('audio')) imadoUppy.use(Audio);
      if (plugins.includes('screen-capture')) imadoUppy.use(ScreenCapture);

      setUppy(imadoUppy);
    };

    initializeUppy();
  }, []);

  return (
    <>
      {uppy && (
        <Dashboard
          uppy={uppy}
          autoOpen={imageMode ? 'imageEditor' : null}
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
export type { UploadUppyProps };
