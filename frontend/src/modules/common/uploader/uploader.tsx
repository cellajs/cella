import Dashboard from '@uppy/react/dashboard';
import { useTranslation } from 'react-i18next';
import { generateRestrictionNote } from '~/modules/common/uploader/helpers/restrictions-note';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { useUploadUppy } from '~/modules/common/uploader/use-uppy-upload';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { useUIStore } from '~/modules/ui/ui-store';

import '~/modules/common/uploader/uppy-styles';

export function Uploader() {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const remove = useUploader((state) => state.remove);

  const { uppy, error, uploaderData } = useUploadUppy();

  if (!uppy || !uploaderData) return null;

  if (error) return <div className="py-3 text-red-600">{error}</div>;

  return (
    <Dialog
      defaultOpen={true}
      onOpenChange={(open) => {
        if (!open) remove();
      }}
    >
      <DialogContent className="h-[40vh] min-h-fit w-[90vw] xs:w-[80vw] max-w-xl md:max-w-2xl">
        <DialogHeader className="with-close-btn">
          <DialogTitle className={uploaderData.title ? 'h-6 leading-6' : 'sr-only'}>
            {uploaderData.title || t('c:upload')}
          </DialogTitle>
          {uploaderData.description && <DialogDescription>{uploaderData.description}</DialogDescription>}
        </DialogHeader>
        <Dashboard
          uppy={uppy}
          autoOpen={['cover', 'avatar'].includes(uploaderData.templateId) ? 'imageEditor' : null}
          width="100%"
          height="400px"
          theme={mode}
          note={generateRestrictionNote(uploaderData.restrictions)}
          proudlyDisplayPoweredByUppy={false}
        />
      </DialogContent>
    </Dialog>
  );
}
