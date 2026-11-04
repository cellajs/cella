import { Trans, useTranslation } from 'react-i18next';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { isImageTemplate } from '~/modules/common/uploader/helpers/image-editor-options';
import { UploadDashboard } from '~/modules/common/uploader/upload-dashboard';
import { uploader } from '~/modules/common/uploader/use-uploader';
import { useUppyUpload } from '~/modules/common/uploader/use-uppy-upload';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';

export function Uploader() {
  const { t } = useTranslation();

  const { uppy, uploadData } = useUppyUpload();

  if (!uppy || !uploadData) return null;

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) uploader.getState().remove();
      }}
    >
      <DialogContent className="h-[40vh] min-h-fit max-w-xl sm:w-[80vw] md:max-w-2xl">
        <DialogHeader>
          <DialogTitle className={uploadData.title ? 'h-6 min-w-0 truncate leading-6' : 'sr-only'}>{uploadData.title || t('c:upload')}</DialogTitle>
        </DialogHeader>
        {uploadData.onDeleteImage ? (
          <DialogDescription>
            <Trans t={t} i18nKey="c:replace_image.text" components={{ delete_anchor: <InlineLinkButton onClick={uploadData.onDeleteImage} /> }} />
          </DialogDescription>
        ) : (
          uploadData.description && <DialogDescription>{uploadData.description}</DialogDescription>
        )}
        <UploadDashboard uppy={uppy} autoOpen={isImageTemplate(uploadData.templateId) ? 'imageEditor' : null} />
      </DialogContent>
    </Dialog>
  );
}
