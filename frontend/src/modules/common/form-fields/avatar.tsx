import { TrashIcon, UploadIcon } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { appConfig, type EntityType } from 'shared';
import { type AvatarEntity, EntityAvatar } from '~/modules/common/entity-avatar';
import { openImageUpload } from '~/modules/common/uploader/open-image-upload';
import { Button } from '~/modules/ui/button';
import { FormField, FormItem, FormLabel } from '~/modules/ui/field';

interface AvatarFormFieldProps {
  // biome-ignore lint/suspicious/noExplicitAny: Accept any form shape
  form: UseFormReturn<any>;
  name: string;
  label: string;
  entity: AvatarEntity & { entityType: EntityType };
  /** Stores a logo under the organization's prefix, so deleting the organization removes it; omitted for a profile picture. */
  organizationId?: string;
}

export function AvatarFormField({ form, label, name, entity, organizationId }: AvatarFormFieldProps) {
  const { t } = useTranslation();

  const setUrl = (url: string | null) => form.setValue(name, url, { shouldDirty: true });

  const openUploadDialog = () => {
    const imageName = entity.entityType !== 'user' ? t('c:resource_logo', { resource: t(entity.entityType) }) : t('c:profile_picture');
    openImageUpload({ templateId: 'thumbnail', organizationId, title: t('c:upload_resource', { resource: imageName }), onUploaded: setUrl });
  };

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field: { value: url } }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="flex gap-4">
            <EntityAvatar className="size-16" entity={{ ...entity, thumbnailUrl: url }} />

            <div className="flex flex-col gap-2">
              {appConfig.has.uploads ? (
                <p className="text-xs sm:text-sm">{t('c:upload_img_max_10mb.text')}</p>
              ) : (
                appConfig.mode === 'development' && <p className="text-muted-foreground text-xs sm:text-sm">{t('c:restrict_image_upload')}</p>
              )}
              <div className="flex items-center gap-2">
                {appConfig.has.uploads && (
                  <Button variant="secondary" type="button" size="sm" onClick={openUploadDialog}>
                    <UploadIcon />
                    <span>{t('c:upload')}</span>
                  </Button>
                )}

                {url && (
                  <Button variant="secondary" onClick={() => setUrl(null)} size="sm" aria-label={t('c:remove')}>
                    <TrashIcon />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </FormItem>
      )}
    />
  );
}
