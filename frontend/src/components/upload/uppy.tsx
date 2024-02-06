import Audio from '@uppy/audio';
import { Uppy, UppyOptions } from '@uppy/core';
import ImageEditor, { ImageEditorOptions } from '@uppy/image-editor';
import { Dashboard } from '@uppy/react';
import ScreenCapture from '@uppy/screen-capture';
import Webcam, { WebcamOptions } from '@uppy/webcam';
import { useEffect, useState } from 'react';
import { useThemeStore } from '~/store/theme';
import { UploadType } from '~/types';
import { ImadoUppy } from '../../lib/imado';

import '@uppy/audio/dist/style.css';
import '@uppy/dashboard/dist/style.min.css';
import '@uppy/image-editor/dist/style.css';
import '@uppy/screen-capture/dist/style.css';
import '@uppy/webcam/dist/style.css';
import './uppy.css';

interface UploadUppyProps {
  setUrl: (url: string) => void;
  plugins?: ('webcam' | 'image-editor' | 'audio' | 'screen-capture')[];
  uppyOptions: UppyOptions;
  avatarMode?: boolean;
}

// Here we init imadoUppy, an enriched Uppy instance that we use to upload files.
// For more info in Imado, see: https://imado.eu/
// For more info on Uppy and its APIs, see: https://uppy.io/docs/

export const UploadUppy = ({ setUrl, uppyOptions, plugins = [], avatarMode = false }: UploadUppyProps) => {
  const [uppy, setUppy] = useState<Uppy | null>(null);
  const { mode } = useThemeStore();

  useEffect(() => {
    const initializeUppy = async () => {
      const imadoUppy = await ImadoUppy(UploadType.Personal, uppyOptions, {
        public: true,
        completionHandler: (urls: URL[]) => {
          if (urls.length > 0) {
            const newImageUrl = urls[0].toString();
            console.log('Upload completed:', newImageUrl);
            setUrl(newImageUrl);
          }
        },
      });

      // For more info on ImageEditorOptions, see: https://uppy.io/docs/image-editor/#options
      const imageEditorOptions: ImageEditorOptions = {
        quality: 0.9,
      };

      // In avatar mode, we want to restrict the image editor
      if (avatarMode) {
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

      const webcamOptions: WebcamOptions = {
        videoConstraints: {
          width: 1280,
          height: 720,
        },
      };

      if (avatarMode) webcamOptions.modes = ['picture'];

      // Set plugins based on plugins props
      if (plugins.includes('webcam')) imadoUppy.use(Webcam, webcamOptions);
      if (plugins.includes('image-editor')) imadoUppy.use(ImageEditor, imageEditorOptions);
      if (plugins.includes('audio')) imadoUppy.use(Audio);
      if (plugins.includes('screen-capture')) imadoUppy.use(ScreenCapture);

      setUppy(imadoUppy);
    };

    initializeUppy();
  }, [setUrl]);

  return (
    <>{uppy && <Dashboard uppy={uppy} autoOpenFileEditor={true} width="100%" height="400px" theme={mode} proudlyDisplayPoweredByUppy={false} />}</>
  );
};

export default UploadUppy;
export type { UploadUppyProps };
