import { Trash, Upload } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap, AvatarWrapProps } from '~/components/avatar-wrap';
import { dialog } from '~/components/dialoger/state';
import { Button } from '~/components/ui/button';

const UploadUppy = lazy(() => import('~/components/upload/uppy'));

interface UploadImageProps extends AvatarWrapProps {
  setUrl: (url: string) => void;
}

export const UploadImage = ({ type, id, name, url, setUrl }: UploadImageProps) => {
  const { t } = useTranslation();

  const removeImage = () => {
    setUrl('');
  };

  return (
    <div className="flex gap-4">
      <AvatarWrap type={type} className="h-20 w-20" id={id} name={name} url={url} />

      <div className="flex flex-col gap-2">
        <p className="font-light text-sm">Upload a PNG or JPEG under 10MB</p>
        <div className="flex gap-2 items-center">
          <Button
            variant="secondary"
            type="button"
            size="sm"
            onClick={() => {
              dialog(
                <Suspense>
                  <UploadUppy
                    uppyOptions={{
                      restrictions: {
                        maxFileSize: 10 * 1024 * 1024,
                        maxNumberOfFiles: 1,
                        allowedFileTypes: ['.jpg', '.jpeg', '.png'],
                      },
                    }}
                    plugins={['webcam', 'image-editor']}
                    avatarMode={true}
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
            }}
          >
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
