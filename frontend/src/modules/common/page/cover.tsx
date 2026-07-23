import { onlineManager } from '@tanstack/react-query';
import { UploadIcon } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { Button } from '~/modules/ui/button';
import { numberToColorClass } from '~/utils/number-to-color-class';

export interface PageCoverProps {
  id: string;
  canUpdate: boolean;
  url?: string | null;
  organizationId?: string;
  coverUpdateCallback: (bannerKey: string) => void;
}

function PageCoverBase({ id, canUpdate, organizationId, url, coverUpdateCallback }: PageCoverProps) {
  const { t } = useTranslation();
  const upload = useUploader();

  const uploadButtonRef = useRef(null);

  const [coverUrl, setCoverUrl] = useState(url);

  const handleUpdateURL = (bannerKey: string) => {
    const bannerUrl = `${appConfig.s3.publicCDNUrl}/${bannerKey}`;
    setCoverUrl(bannerUrl);
    coverUpdateCallback(bannerUrl);
  };

  // Open upload dialog
  const openUploadDialog = () => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    upload.create({
      id: 'page-cover',
      publicBucket: true,
      ...(organizationId ? { organizationId, personalUpload: false } : { personalUpload: true }),
      plugins: ['webcam', 'image-editor', 'url'],
      templateId: 'cover',
      statusEventHandler: {
        onComplete(result) {
          const url = result.cover[0].url;
          if (url) handleUpdateURL(url);
          upload.remove();
        },
      },
      title: t('c:upload_item', { item: t('c:cover').toLowerCase() }),
    });
  };
  return (
    <div
      data-url={!!url}
      className={`relative flex h-32 bg-center bg-cover ${numberToColorClass(id)} min-h-40 data-[url=true]:h-[20vw] sm:min-w-52`}
      style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}
    >
      {canUpdate && appConfig.has.uploadEnabled && (
        <Button
          ref={uploadButtonRef}
          variant="secondary"
          size="sm"
          className="relative top-3 mx-auto opacity-50 hover:bg-secondary hover:opacity-80"
          onClick={openUploadDialog}
        >
          <UploadIcon className="mr-2" />
          <span>{t('c:upload_item', { item: t('c:cover').toLowerCase() })}</span>
        </Button>
      )}
    </div>
  );
}

export const PageCover = memo(PageCoverBase);
