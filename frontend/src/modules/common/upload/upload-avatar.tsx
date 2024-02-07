import { Trash, Upload } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap, AvatarWrapProps } from '~/modules/common/avatar-wrap';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { UploadType } from '~/types';

const UploadUppy = lazy(() => import('~/modules/common/upload/upload-uppy'));

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
            dialog.remove('upload-image');
          }}
        />
      </Suspense>,
      {
        id: 'upload-image',
        drawerOnMobile: false,
        title: t('label.upload_image', {
          defaultValue: 'Upload image',
        }),
        className: 'sm:max-w-xl',
      },
    );
  };

  return (
    <div className="flex gap-4">
      <AvatarWrap type={type} className="h-20 w-20" id={id} name={name} url={url} />

      <div className="flex flex-col gap-2">
        <p className="font-light text-sm">Upload a PNG or JPEG under 10MB</p>
        <div className="flex gap-2 items-center">
          <Button variant="secondary" type="button" size="sm" onClick={openUploadDialog}>
            <Upload size={20} className="mr-2" />
            <span>
              {t('action.upload', {
                defaultValue: 'Upload',
              })}
            </span>
          </Button>

          {url && (
            <Button variant="ghost" onClick={removeImage} size="sm">
              <Trash size={20} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
