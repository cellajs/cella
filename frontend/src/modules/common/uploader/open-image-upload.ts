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
}

/** Opens the uploader for one image, cropped as its template says, and hands over the image's public URL. */
export const openImageUpload = ({ templateId, organizationId, title, onUploaded }: ImageUploadOptions) => {
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
    title,
  });
};
