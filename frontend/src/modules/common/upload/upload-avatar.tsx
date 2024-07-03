import { Trash, Upload } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap, type AvatarWrapProps } from '~/modules/common/avatar-wrap';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { UploadType } from '~/types';
import { lazyWithPreload } from 'react-lazy-with-preload';

const UploadUppy = lazyWithPreload(() => import('~/modules/common/upload/upload-uppy'));

interface UploadAvatarProps extends AvatarWrapProps {
  setUrl: (url: string) => void;
}

export const UploadAvatar = ({ type, id, name, url, setUrl }: UploadAvatarProps) => {
  const { t } = useTranslation();

  const removeImage = () => {
    setUrl('');
  };

  // Open the upload dialog
  const openUploadDialog = () => {
    dialog(
      <Suspense>
        <UploadUppy
          isPublic={true}
          uploadType={UploadType.Personal}
          uppyOptions={{
            restrictions: {
              maxFileSize: 10 * 1024 * 1024,
              maxNumberOfFiles: 1,
              allowedFileTypes: ['.jpg', '.jpeg', '.png'],
            },
          }}
          plugins={['webcam', 'image-editor']}
          imageMode="avatar"
          setUrl={(url) => {
            setUrl(url);
            dialog.remove(true, 'upload-image');
          }}
        />
      </Suspense>,
      {
        id: 'upload-image',
        drawerOnMobile: false,
        title: t('common:upload_image'),
        className: 'md:max-w-xl',
      },
    );
  };

  return (
    <div className="flex gap-4">
      <AvatarWrap type={type} className="h-16 w-16" id={id} name={name} url={url} />

      <div className="flex flex-col gap-2">
        <p className="font-light text-xs sm:text-sm">{t('common:upload_img_max_10mb.text')}</p>
        <div className="flex gap-2 items-center">
          <Button variant="plain" type="button" size="sm" onClick={openUploadDialog} onMouseOver={() => UploadUppy.preload()}>
            <Upload size={16} className="mr-2" />
            <span>{t('common:upload')}</span>
          </Button>

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
