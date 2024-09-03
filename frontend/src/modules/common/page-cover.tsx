import type { Entity } from 'backend/types/common';
import { Upload } from 'lucide-react';
import { Suspense, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lazyWithPreload } from 'react-lazy-with-preload';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { getColorClass } from '~/lib/utils';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import { UploadType } from '~/types';

// Lazy load the upload component
const UploadUppy = lazyWithPreload(() => import('~/modules/common/upload/upload-uppy'));

export interface PageCoverProps {
  id: string;
  type: Entity;
  url?: string | null;
}

const PageCover = memo(({ type, id, url }: PageCoverProps) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const { menu } = useNavigationStore();

  const [coverUrl, setCoverUrl] = useState(url);

  // TODO is this best way to get entity and role?
  const [entity] = Object.values(menu)
    .flat()
    .filter((el) => el.id === id);

  const isSelf = id === user.id;
  const isAdmin = entity ? entity.membership.role === 'admin' : false;

  const bannerHeight = url ? 'h-[20vw] min-h-40 sm:min-w-52' : 'h-32'; // : 'h-14';
  const bannerClass = url ? 'bg-background' : getColorClass(id);

  const setUrl = (newUrl: string) => {
    setCoverUrl(newUrl);
    if (type === 'organization') dispatchCustomEvent('updateOrganizationCover', newUrl);
    if (type === 'user') dispatchCustomEvent('updateUserCover', newUrl);
    if (type === 'workspace') dispatchCustomEvent('updateWorkspaceCover', newUrl);
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
              minFileSize: null,
              maxTotalFileSize: 10 * 1024 * 1024, // 100MB
              minNumberOfFiles: null,
              requiredMetaFields: [],
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
    <div className={`relative bg-cover bg-center ${bannerHeight} ${bannerClass}`} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}>
      {(isAdmin || isSelf) && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-3 right-3 opacity-50 hover:opacity-80 hover:bg-secondary"
          onClick={openUploadDialog}
          onMouseOver={() => UploadUppy.preload()}
        >
          <Upload size={16} />
          <span className="ml-1">{t('common:upload_cover')}</span>
        </Button>
      )}
    </div>
  );
});

export { PageCover };
