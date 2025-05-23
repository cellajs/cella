import { Dialog } from '@radix-ui/react-dialog';
import { Dashboard } from '@uppy/react';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { useUploadUppy } from '~/modules/common/uploader/use-uppy-upload';
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { useUIStore } from '~/store/ui';

import '@uppy/audio/dist/style.css';
import '@uppy/dashboard/dist/style.min.css';
import '@uppy/image-editor/dist/style.css';
import '@uppy/screen-capture/dist/style.css';
import '@uppy/webcam/dist/style.css';
import '~/modules/common/uploader/uppy.css';

export const Uploader = () => {
  const mode = useUIStore((state) => state.mode);
  const remove = useUploader((state) => state.remove);

  const { uppy, error, uploaderData } = useUploadUppy();

  if (!uppy || !uploaderData) return null;

  // Catch and display errors
  if (error) return <div className="text-red-600 py-3">{error}</div>;

  return (
    <Dialog
      defaultOpen={true}
      onOpenChange={(open) => {
        if (!open) remove();
      }}
    >
      <DialogContent className="w-[70vw] h-[40vh] min-h-fit md:max-w-xl">
        <DialogHeader className={`${uploaderData.title || uploaderData.description ? '' : 'hidden'}`}>
          <DialogTitle className={`${uploaderData.title || uploaderData.title ? '' : 'hidden'} leading-6 h-6`}>{uploaderData.title}</DialogTitle>
          <DialogDescription className={`${uploaderData.description ? '' : 'hidden'}`}>{uploaderData.description}</DialogDescription>
        </DialogHeader>

        {/* For accessibility */}
        {!uploaderData.description && !uploaderData.title && <DialogTitle className="hidden" />}
        <Dashboard
          uppy={uppy}
          autoOpen={['cover', 'avatar'].includes(uploaderData.templateId) ? 'imageEditor' : null}
          width="100%"
          height="400px"
          theme={mode}
          proudlyDisplayPoweredByUppy={false}
        />
      </DialogContent>
    </Dialog>
  );
};
