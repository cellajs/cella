import { useTranslation } from 'react-i18next';
import { isImageTemplate } from '~/modules/common/uploader/helpers/image-editor-options';
import { UploadDashboard } from '~/modules/common/uploader/upload-dashboard';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { useUppyUpload } from '~/modules/common/uploader/use-uppy-upload';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';

export function Uploader() {
  const { t } = useTranslation();
  const remove = useUploader((state) => state.remove);

  const { uppy, uploadData } = useUppyUpload();

  if (!uppy || !uploadData) return null;

  return (
    <Dialog
      defaultOpen={true}
      onOpenChange={(open) => {
        if (!open) remove();
      }}
    >
      <DialogContent className="h-[40vh] min-h-fit w-[90vw] xs:w-[80vw] max-w-xl md:max-w-2xl">
        <DialogHeader className="with-close-btn">
          <DialogTitle className={uploadData.title ? 'h-6 leading-6' : 'sr-only'}>{uploadData.title || t('c:upload')}</DialogTitle>
          {uploadData.description && <DialogDescription>{uploadData.description}</DialogDescription>}
        </DialogHeader>
        <UploadDashboard uppy={uppy} autoOpen={isImageTemplate(uploadData.templateId) ? 'imageEditor' : null} />
      </DialogContent>
    </Dialog>
  );
}
