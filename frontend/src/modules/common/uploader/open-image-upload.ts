import { onlineManager } from '@tanstack/react-query';
import { uploadTemplates } from 'shared/transloadit-config';
import { getPublicFileUrl } from '~/modules/attachment/file-url';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { uploader } from '~/modules/common/uploader/use-uploader';

interface ImageUploadOptions {
  templateId: 'avatar' | 'cover';
  /** The organization the image belongs to; without one the upload is personal. */
  organizationId?: string;
  /** The uploader dialog's title. */
  title: string;
  onUploaded: (url: string) => void;
  /** Offers to delete the current image from the dialog; omit it when there is no image or the caller has its own delete button. */
  onDelete?: () => void;
}

/** Opens the uploader for one image, cropped as its template says, and hands over the image's public URL. */
export const openImageUpload = ({ templateId, organizationId, title, onUploaded, onDelete }: ImageUploadOptions) => {
  if (!onlineManager.isOnline()) return toastOffline();

  const [resultStep] = uploadTemplates[templateId].use;
  uploader.getState().create({
    ...(organizationId ? { organizationId, personalUpload: false } : { personalUpload: true }),
    plugins: ['webcam', 'image-editor', 'url'],
    templateId,
    onComplete(results) {
      const key = results[resultStep][0].url;
      if (key) onUploaded(getPublicFileUrl(key));
      uploader.getState().remove();
    },
    onDeleteImage:
      onDelete &&
      (() => {
        onDelete();
        uploader.getState().remove();
      }),
    title,
  });
};
