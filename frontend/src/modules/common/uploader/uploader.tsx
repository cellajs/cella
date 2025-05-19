import { Dashboard } from '@uppy/react';
import { useUploadUppy } from './use-uppy-upload';

import '@uppy/audio/dist/style.css';
import '@uppy/dashboard/dist/style.min.css';
import '@uppy/image-editor/dist/style.css';
import '@uppy/screen-capture/dist/style.css';
import '@uppy/webcam/dist/style.css';
import '~/modules/attachments/upload/uppy.css';
import { useUIStore } from '~/store/ui';

export const Uploader = () => {
  const { uppy, error } = useUploadUppy();
  const mode = useUIStore((state) => state.mode);

  // Catch and display errors
  if (error || !uppy) return <div className="text-red-600 py-3">{error || 'Uppy not initialized'}</div>;

  return (
    <Dashboard
      uppy={uppy}
      // TODO(UPPYREFACTOR)
      // autoOpen={['cover', 'avatar'].includes(templateId) ? 'imageEditor' : null}
      width="100%"
      height="400px"
      theme={mode}
      proudlyDisplayPoweredByUppy={false}
    />
  );
};
