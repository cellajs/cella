import type { Uppy } from '@uppy/core';
import { Dashboard } from '@uppy/react';
import type { UploadTemplateId } from 'config';
import { useState } from 'react';
import type { CustomUppyOpt, UploadedUppyFile } from '~/modules/common/uploader/types';
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
  restrictions?: Partial<CustomUppyOpt['restrictions']>;
  templateId?: UploadTemplateId;
  organizationId?: string;
  callback?: (result: UploadedUppyFile<UploadTemplateId>) => void;
  onRetrySuccessCallback?: (result: UploadedUppyFile<UploadTemplateId>, previousIds: string[]) => void;
}

// Here we init imadoUppy, an enriched Uppy instance that we use to upload files.
// For more info in Imado, see: https://imado.eu/
// For more info on Uppy and its APIs, see: https://uppy.io/docs/

// TODO merge this with imadoUppy or figure out a clearer separation of concerns
export const UploadUppy = ({ templateId = 'attachment' }: UploadUppyProps) => {
  const [uppy] = useState<Uppy | null>(null);
  const [error] = useState<string | null>(null);
  const mode = useUIStore((state) => state.mode);

  // useEffect(() => {
  //   const initializeUppy = async () => {
  //     try {
  //       const imadoUppy = await ImadoUppy(uploadType, uppyOptions, {
  //         public: isPublic,
  //         organizationId,
  //         templateId,
  //         statusEventHandler: {
  //           onComplete: (results) => {
  //             if (callback) callback(results);
  //           },
  //           onRetrySuccess(results, localStoreIds) {
  //             if (onRetrySuccessCallback) onRetrySuccessCallback(results, localStoreIds);
  //           },
  //           onFileEditorComplete: () => {
  //             if (['cover', 'avatar'].includes(templateId)) imadoUppy.upload();
  //           },
  //         },
  //       });

  //       const imageEditorOptions: ImageEditorOptions = getImageEditorOptions(templateId);
  //       const webcamOptions: WebcamOptions<UppyMeta, UppyBody> = {
  //         videoConstraints: { width: 1280, height: 720 },
  //         preferredVideoMimeType: 'video/webm;codecs=vp9',
  //       };

  //       if (['cover', 'avatar'].includes(templateId)) webcamOptions.modes = ['picture'];

  //       if (plugins.includes('webcam')) imadoUppy.use(Webcam, webcamOptions);
  //       if (plugins.includes('image-editor')) imadoUppy.use(ImageEditor, imageEditorOptions);
  //       if (plugins.includes('audio')) imadoUppy.use(Audio);
  //       if (plugins.includes('screen-capture')) imadoUppy.use(ScreenCapture, { preferredVideoMimeType: 'video/webm;codecs=vp9' });

  //       setUppy(imadoUppy);
  //     } catch (err) {
  //       const message = err instanceof Error ? err.message : 'Failed to initialize upload';
  //       setError(message);
  //     }
  //   };

  //   initializeUppy();
  // }, []);

  // Catch and display errors
  if (error) return <div className="text-red-600 py-3">{error}</div>;

  return (
    <>
      {uppy && (
        <Dashboard
          uppy={uppy}
          autoOpen={['cover', 'avatar'].includes(templateId) ? 'imageEditor' : null}
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
