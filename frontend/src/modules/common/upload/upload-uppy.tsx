import Audio from '@uppy/audio';
import type { Uppy, UppyOptions } from '@uppy/core';
import ImageEditor from '@uppy/image-editor';
import { Dashboard } from '@uppy/react';
import ScreenCapture from '@uppy/screen-capture';
import Webcam, { type WebcamOptions } from '@uppy/webcam';
import { useEffect, useState } from 'react';
import { ImadoUppy, type UppyBody, type UppyMeta } from '~/lib/imado';
import { useThemeStore } from '~/store/theme';
import type { UploadType } from '~/types';

import '@uppy/audio/dist/style.css';
import '@uppy/dashboard/dist/style.min.css';
import '@uppy/image-editor/dist/style.css';
import '@uppy/screen-capture/dist/style.css';
import '@uppy/webcam/dist/style.css';
import './uppy.css';

type UppyCombinedOptions = UppyOptions<UppyMeta & UppyBody>;

type CombinedWebcamOptions = WebcamOptions & {
  meta: UppyMeta;
  body: UppyBody;
};

interface UploadUppyProps {
  uploadType: UploadType;
  isPublic: boolean;
  setUrl: (url: string) => void;
  plugins?: ('webcam' | 'image-editor' | 'audio' | 'screen-capture')[];
  uppyOptions: UppyCombinedOptions;
  imageMode?: 'cover' | 'avatar';
  organizationId?: string;
}

// Here we init imadoUppy, an enriched Uppy instance that we use to upload files.
// For more info in Imado, see: https://imado.eu/
// For more info on Uppy and its APIs, see: https://uppy.io/docs/

export const UploadUppy = ({ uploadType, isPublic, organizationId, setUrl, uppyOptions, plugins = [], imageMode }: UploadUppyProps) => {
  const [uppy, setUppy] = useState<Uppy | null>(null);
  const { mode } = useThemeStore();

  useEffect(() => {
    const initializeUppy = async () => {
      const imadoUppy = await ImadoUppy(uploadType, uppyOptions, {
        public: isPublic,
        organizationId: organizationId,
        completionHandler: (urls: URL[]) => {
          if (urls.length > 0) {
            const newImageUrl = urls[0].toString();
            console.info('Upload completed:', newImageUrl);
            setUrl(newImageUrl);
          }
        },
      });

      // TODO: Somehow the type ImageEditorOptions is not being imported
      // For more info on ImageEditorOptions, see: https://uppy.io/docs/image-editor/#options
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      const imageEditorOptions: any = {
        quality: 0.9,
      };

      // In avatar mode, we want to restrict the image editor
      if (imageMode === 'avatar') {
        imageEditorOptions.cropperOptions = {
          croppedCanvasOptions: {},
          viewMode: 1,
          background: false,
          autoCropArea: 1,
          responsive: true,
          aspectRatio: 1,
          guides: false,
          center: false,
          highlight: false,
          movable: false,
          rotatable: false,
          scalable: false,
          zoomable: false,
          zoomOnTouch: false,
          zoomOnWheel: false,
        };
        imageEditorOptions.actions = {
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
      }

      // In avatar mode, we want to restrict the image editor
      if (imageMode === 'cover') {
        imageEditorOptions.cropperOptions = {
          croppedCanvasOptions: {},
          viewMode: 1,
          background: false,
          autoCropArea: 1,
          responsive: true,
          aspectRatio: 3 / 1,
          guides: false,
          center: false,
          highlight: false,
          movable: false,
          rotatable: false,
          scalable: false,
          zoomable: false,
          zoomOnTouch: false,
          zoomOnWheel: false,
        };
        imageEditorOptions.actions = {
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
      }

      const webcamOptions: CombinedWebcamOptions = {
        videoConstraints: {
          width: 1280,
          height: 720,
        },
        meta: {},
        body: {},
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
  }, [setUrl]);

  return <>{uppy && <Dashboard uppy={uppy} width="100%" height="400px" theme={mode} proudlyDisplayPoweredByUppy={false} />}</>;
};

export default UploadUppy;
export type { UploadUppyProps };
