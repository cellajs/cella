import { Upload } from 'lucide-react';
import { Suspense, lazy, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getColorClass } from '~/lib/utils';
import { dialog } from '~/modules/common/dialoger/state';
import { useUpdateOrganizationMutation } from '~/modules/organizations/update-organization-form';
import { Button } from '~/modules/ui/button';
import { useUpdateUserMutation } from '~/modules/users/update-user-form';
import { UploadType } from '~/types';

// Lazy load the upload component
const UploadUppy = lazy(() => import('~/modules/common/upload/upload-uppy'));

export interface PageCoverProps {
  id: string;
  type: 'user' | 'organization';
  url?: string | null;
}

const PageCover = memo(({ type, id, url }: PageCoverProps) => {
  const { t } = useTranslation();
  const bannerHeight = url ? 'h-[20vw] min-h-[160px] md:min-h-[210px]' : 'h-32'; // : 'h-14';
  const bannerClass = url ? 'bg-background' : getColorClass(id);
  const { mutate: mutateOrganization } = useUpdateOrganizationMutation(id);
  const { mutate: mutateUser } = useUpdateUserMutation(id);

  const mutateOptions = {
    onSuccess: () => {
      toast.success(t('common:success.upload_cover'));
    },
    onError: () => {
      toast.error(t('common:error.image_upload_failed'));
    },
  };

  const setUrl = (url: string) => {
    if (type === 'organization') mutateOrganization({ bannerUrl: url }, mutateOptions);
    else mutateUser({ bannerUrl: url }, mutateOptions);
  };

  // Open the upload dialog
  const openUploadDialog = () => {
    dialog(
      <Suspense>
        <UploadUppy
          isPublic={true}
          organizationId={id}
          uploadType={UploadType.Organization}
          uppyOptions={{
            restrictions: {
              maxFileSize: 10 * 1024 * 1024, // 10MB
              maxNumberOfFiles: 1,
              allowedFileTypes: ['.jpg', '.jpeg', '.png'],
            },
          }}
          plugins={['webcam', 'image-editor']}
          imageMode="cover"
          setUrl={(url) => {
            setUrl(url);
            dialog.remove(true, 'page-cover');
          }}
        />
      </Suspense>,
      {
        id: 'page-cover',
        drawerOnMobile: false,
        title: t('common:upload_cover'),
        className: 'md:max-w-xl',
      },
    );
  };

  return (
    <div className={`relative bg-cover bg-center ${bannerHeight} ${bannerClass}`} style={url ? { backgroundImage: `url(${url})` } : {}}>
      <Button variant="secondary" size="sm" className="absolute top-3 right-3" onClick={openUploadDialog}>
        <Upload size={16} />
        <span className="ml-1">{t('common:upload_cover')}</span>
      </Button>
    </div>
  );
});

export { PageCover };
