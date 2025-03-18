import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { Trash, Upload } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { lazyWithPreload } from 'react-lazy-with-preload';
import { AvatarWrap, type AvatarWrapProps } from '~/modules/common/avatar-wrap';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';

const UploadUppy = lazyWithPreload(() => import('~/modules/attachments/upload/upload-uppy'));

interface UploadAvatarProps extends AvatarWrapProps {
  setUrl: (url: string | null) => void;
}

export const UploadAvatar = ({ type, id, name, url, setUrl }: UploadAvatarProps) => {
  const { t } = useTranslation();

  const removeImage = () => setUrl(null);

  // Open the upload dialog
  const openUploadDialog = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    useDialoger.getState().create(
      <Suspense fallback={<Spinner className="my-44 h-12 w-12" noDelay />}>
        <UploadUppy
          isPublic
          uploadType="personal"
          plugins={['webcam', 'image-editor']}
          imageMode="avatar"
          callback={(result) => {
            const url = result[0].url;
            if (url) setUrl(url);
            useDialoger.getState().remove('upload-image');
          }}
        />
      </Suspense>,
      {
        id: 'upload-image',
        drawerOnMobile: false,
        title: t('common:upload_item', { item: t('common:profile_picture').toLowerCase() }),
        className: 'md:max-w-xl',
      },
    );
  };

  return (
    <div className="flex gap-4">
      <AvatarWrap type={type} className="h-16 w-16" id={id} name={name} url={url} />

      <div className="flex flex-col gap-2">
        {config.has.imado ? (
          <p className="font-light text-xs sm:text-sm">{t('common:upload_img_max_10mb.text')}</p>
        ) : (
          config.mode === 'development' && <p className="font-light text-xs sm:text-sm">{t('common:restrict_image_upload')}</p>
        )}
        <div className="flex gap-2 items-center">
          {config.has.imado && (
            <Button variant="plain" type="button" size="sm" onClick={openUploadDialog} onMouseOver={() => UploadUppy.preload()}>
              <Upload size={16} className="mr-2" />
              <span>{t('common:upload')}</span>
            </Button>
          )}

          {url && (
            <Button variant="secondary" onClick={removeImage} size="sm">
              <Trash size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
