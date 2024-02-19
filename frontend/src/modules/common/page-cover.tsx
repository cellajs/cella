import { Camera } from 'lucide-react';
import { Suspense, lazy, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getColorClass } from '~/lib/utils';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { useUpdateOrganizationMutation } from '~/router/routeTree';
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
  const bannerHeight = url ? 'h-[20vw] min-h-[160px] md:min-h-[210px]' : 'h-28'; // : 'h-14';
  const bannerClass = url ? 'bg-background' : getColorClass(id);
  const { mutate } = useUpdateOrganizationMutation(id);

  const setUrl = (url: string) => {
    if (type === 'organization') {
      mutate(
        {
          bannerUrl: url,
        },
        {
          onSuccess: () => {
            toast.success(t('label.image_uploaded'));
          },
          onError: () => {
            toast.error(t('label.error_uploading_image'));
          },
        },
      );
    }
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
            dialog.remove('page-cover');
          }}
        />
      </Suspense>,
      {
        id: 'page-cover',
        drawerOnMobile: false,
        title: t('common:label.upload_image'),
        className: 'sm:max-w-xl',
      },
    );
  };

  return (
    <div className={`relative bg-cover bg-center ${bannerHeight} ${bannerClass}`} style={url ? { backgroundImage: `url(${url})` } : {}}>
      <Button variant="secondary" className="absolute top-2 right-2" onClick={openUploadDialog}>
        <Camera size={16} />
        <span className="ml-1">{t('common:label.upload_image')}</span>
      </Button>
    </div>
  );
});

export { PageCover };
