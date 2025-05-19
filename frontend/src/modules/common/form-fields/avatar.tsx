import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { Trash, Upload } from 'lucide-react';
import { useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AvatarWrap, type AvatarWrapProps } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { FormControl, FormField, FormItem, FormLabel } from '~/modules/ui/form';
import { toaster } from '../toaster';
import { useUploader } from '../uploader/use-uploader';

interface Props {
  form: UseFormReturn;
  name: string;
  label: string;
  entity: {
    id?: string;
    name?: string | null;
  };
  type: AvatarWrapProps['type'];
}

const AvatarFormField = ({ form, label, name, entity, type }: Props) => {
  const { t } = useTranslation();
  const uploadButtonRef = useRef(null);
  const upload = useUploader();

  const { control } = form;
  const url = form.getValues(name);

  const handleUpdateURL = (key: string | null) => {
    const urlWithPublicCDN = key ? `${config.publicCDNUrl}/${key}` : null;
    form.setValue(name, urlWithPublicCDN, { shouldDirty: true });
  };

  // Open upload dialog
  const openUploadDialog = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
    upload.create({
      id: 'upload-image',
      isPublic: true,
      personalUpload: true,
      plugins: ['webcam', 'image-editor'],
      templateId: 'avatar',
      statusEventHandler: {
        onComplete(result) {
          const url = result.thumbnail[0].url;
          if (url) handleUpdateURL(url);
          upload.remove();
        },
      },
      title: t('common:upload_item', { item: t('common:profile_picture').toLowerCase() }),
    });
  };

  return (
    <FormField
      control={control}
      name={name}
      render={() => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <div className="flex gap-4">
              <AvatarWrap type={type} className="h-16 w-16 text-2xl" id={entity.id} name={name} url={url} />

              <div className="flex flex-col gap-2">
                {config.has.s3 ? (
                  <p className="font-light text-xs sm:text-sm">{t('common:upload_img_max_10mb.text')}</p>
                ) : (
                  config.mode === 'development' && <p className="font-light text-xs sm:text-sm">{t('common:restrict_image_upload')}</p>
                )}
                <div className="flex gap-2 items-center">
                  {config.has.s3 && (
                    <Button ref={uploadButtonRef} variant="plain" type="button" size="sm" onClick={openUploadDialog}>
                      <Upload size={16} className="mr-2" />
                      <span>{t('common:upload')}</span>
                    </Button>
                  )}

                  {url && (
                    <Button variant="secondary" onClick={() => handleUpdateURL(null)} size="sm">
                      <Trash size={16} />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </FormControl>
        </FormItem>
      )}
    />
  );
};

export default AvatarFormField;
