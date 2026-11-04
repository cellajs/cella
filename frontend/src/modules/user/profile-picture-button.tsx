import { CameraIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UserBase } from 'sdk';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { openImageUpload } from '~/modules/common/uploader/open-image-upload';
import { Button } from '~/modules/ui/button';
import { useUpdateUser } from '~/modules/user/query';
import { cn } from '~/utils/cn';

interface ProfilePictureButtonProps {
  user: Pick<UserBase, 'id' | 'thumbnailUrl'>;
  className?: string;
}

/** A camera button on the corner of a user's avatar that uploads, changes or deletes their profile picture. */
export function ProfilePictureButton({ user, className }: ProfilePictureButtonProps) {
  const { t } = useTranslation();
  const { mutate: updateUser } = useUpdateUser(user.id);

  if (!appConfig.has.uploadEnabled) return null;

  const label = t(user.thumbnailUrl ? 'c:change_resource' : 'c:upload_resource', { resource: t('c:profile_picture') });

  const upload = () =>
    openImageUpload({
      templateId: 'avatar',
      title: label,
      onUploaded: (thumbnailUrl) =>
        updateUser({ thumbnailUrl }, { onSuccess: () => toaster.success(t('c:success.update_resource', { resource: t('c:profile_picture') })) }),
      onDelete: user.thumbnailUrl
        ? () =>
            updateUser(
              { thumbnailUrl: null },
              { onSuccess: () => toaster.success(t('c:success.delete_resource', { resource: t('c:profile_picture') })) },
            )
        : undefined,
    });

  return (
    <Button
      variant="outline-ghost"
      size="icon"
      aria-label={label}
      onClick={upload}
      // Frosted like the bar behind the name
      className={cn(
        'bg-background/50 hover:bg-background/75 dark:bg-background/75 pointer-events-auto absolute -right-1 -bottom-1 size-7 rounded-full backdrop-blur-xs max-sm:size-8',
        className,
      )}
    >
      <CameraIcon className="size-3.5" />
    </Button>
  );
}
