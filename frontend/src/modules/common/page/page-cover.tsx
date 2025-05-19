import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { Upload } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lazyWithPreload } from 'react-lazy-with-preload';
import { toaster } from '~/modules/common/toaster';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { Button } from '~/modules/ui/button';
import { numberToColorClass } from '~/utils/number-to-color-class';

// Lazy load the upload component
const UploadUppy = lazyWithPreload(() => import('~/modules/attachments/upload/upload-uppy'));

export interface PageCoverProps {
  id: string;
  canUpdate: boolean;
  url?: string | null;
  coverUpdateCallback: (bannerKey: string) => void;
}

const PageCover = memo(({ id, canUpdate, url, coverUpdateCallback }: PageCoverProps) => {
  const { t } = useTranslation();
  const upload = useUploader();

  const uploadButtonRef = useRef(null);

  const [coverUrl, setCoverUrl] = useState(url);

  const handleUpdateURL = (bannerKey: string) => {
    const bannerUrl = `${config.publicCDNUrl}/${bannerKey}`;
    setCoverUrl(bannerUrl);
    coverUpdateCallback(bannerUrl);
  };

  // Open upload dialog
  const openUploadDialog = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
    upload.create({
      id: 'page-cover',
      isPublic: true,
      // TODO CHECK if here pass an org Id
      organizationId: id,
      personalUpload: false,
      plugins: ['webcam', 'image-editor'],
      templateId: 'cover',
      statusEventHandler: {
        onComplete(result) {
          const url = result.cover[0].url;
          if (url) handleUpdateURL(url);
          upload.remove();
        },
      },
      title: t('common:upload_item', { item: t('common:cover').toLowerCase() }),
    });
  };
  return (
    <div
      data-url={!!url}
      className={`relative flex bg-cover bg-center h-32 ${numberToColorClass(id)} data-[url=true]:h-[20vw] min-h-40 sm:min-w-52`}
      style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}
    >
      {canUpdate && config.has.imado && (
        <Button
          ref={uploadButtonRef}
          variant="secondary"
          size="sm"
          className="relative top-3 mx-auto opacity-50 hover:opacity-80 hover:bg-secondary"
          onClick={openUploadDialog}
          onMouseOver={() => UploadUppy.preload()}
        >
          <Upload size={16} />
          <span className="ml-1">{t('common:upload_item', { item: t('common:cover').toLowerCase() })}</span>
        </Button>
      )}
    </div>
  );
});

export { PageCover };
