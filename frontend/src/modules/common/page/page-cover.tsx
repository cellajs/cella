import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { Upload } from 'lucide-react';
import { Suspense, memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lazyWithPreload } from 'react-lazy-with-preload';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';
import { numberToColorClass } from '~/utils/number-to-color-class';

// Lazy load the upload component
const UploadUppy = lazyWithPreload(() => import('~/modules/attachments/upload/upload-uppy'));

export interface PageCoverProps {
  id: string;
  canUpdate: boolean;
  url?: string | null;
  coverUpdateCallback: (bannerUrl: string) => void;
}

const PageCover = memo(({ id, canUpdate, url, coverUpdateCallback }: PageCoverProps) => {
  const { t } = useTranslation();
  const dialog = useDialoger();

  const uploadButtonRef = useRef(null);

  const [coverUrl, setCoverUrl] = useState(url);

  const setUrl = (bannerUrl: string) => {
    setCoverUrl(bannerUrl);
    coverUpdateCallback(bannerUrl);
  };

  // Open the upload dialog
  const openUploadDialog = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    dialog.create(
      <Suspense fallback={<Spinner className="my-44 h-12 w-12" noDelay />}>
        <UploadUppy
          isPublic
          organizationId={id}
          uploadType="organization"
          plugins={['webcam', 'image-editor']}
          templateId="cover"
          callback={(result) => {
            const url = result.cover[0].url;
            if (url) setUrl(url);
            dialog.remove('page-cover');
          }}
        />
      </Suspense>,
      {
        id: 'page-cover',
        triggerRef: uploadButtonRef,
        drawerOnMobile: false,
        title: t('common:upload_item', { item: t('common:cover').toLowerCase() }),
        className: 'md:max-w-xl',
      },
    );
  };
  return (
    <div
      data-url={!!url}
      className={`relative flex bg-cover bg-center h-32 ${numberToColorClass(id)} data-[url=true]:h-[20vw] min-h-40 sm:min-w-52`}
      style={coverUrl ? { backgroundImage: `url(${config.publicCDNUrl}/${coverUrl})` } : {}}
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
