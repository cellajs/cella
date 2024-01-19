import { Trash, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap, AvatarWrapProps } from '~/components/avatar-wrap';
import { dialog } from '~/components/dialoger/state';
import { Button } from '~/components/ui/button';

import { UploadUppy, UploadUppyProps } from '~/components/upload-uppy';

interface UploadImageProps extends AvatarWrapProps, UploadUppyProps {}

const UploadImage = ({ type, id, name, url, setUrl }: UploadImageProps) => {
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
                <UploadUppy
                  setUrl={(url) => {
                    setUrl(url);
                    dialog.remove('upload-image');
                  }}
                />,
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

export { UploadImage };
