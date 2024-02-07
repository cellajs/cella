import { Camera } from 'lucide-react';
import { Suspense, lazy, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getColorClass } from '~/lib/utils';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';

const UploadUppy = lazy(() => import('~/modules/common/upload/uppy'));

export interface PageCoverProps {
  id?: string;
  type?: 'user' | 'organization';
  name?: string | null;
  url?: string | null;
}

const PageCover = memo(({ type, id, url }: PageCoverProps) => {
  const { t } = useTranslation();
  const bannerHeight = url ? 'h-[20vw] min-h-[160px] md:min-h-[210px]' : 'h-28';
  const bannerClass = url ? 'bg-background' : getColorClass(id);

  const setUrl = (url: string) => {
    console.log(url, type);
  };

  return (
    <div className={`relative bg-cover bg-center ${bannerHeight} ${bannerClass}`} style={url ? { backgroundImage: `url(${url})` } : {}}>
      <Button
        variant="secondary"
        className="absolute top-2 right-2"
        onClick={() => {
          dialog(
            <Suspense>
              <UploadUppy
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
              title: t('label.upload_image', {
                defaultValue: 'Upload image',
              }),
              className: 'sm:max-w-xl',
            },
          );
        }}
      >
        <Camera size={16} />
        <span className="ml-1">Upload image</span>
      </Button>
    </div>
  );
});

export { PageCover };
