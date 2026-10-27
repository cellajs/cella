import { UploadIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { openImageUpload } from '~/modules/common/uploader/open-image-upload';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { numberToColorClass } from '~/utils/number-to-color-class';

export interface PageCoverProps {
  id: string;
  canUpdate: boolean;
  url?: string | null;
  organizationId?: string;
  onCoverUpdate?: (bannerKey: string) => void;
}

function PageCoverBase({ id, canUpdate, organizationId, url, onCoverUpdate }: PageCoverProps) {
  const { t } = useTranslation();
  // A fresh upload shows at once and holds until `url` moves: to the saved cover, or to one written elsewhere
  const [upload, setUpload] = useState<{ url: string; replaces: PageCoverProps['url'] } | null>(null);
  const coverUrl = upload && upload.replaces === url ? upload.url : url;

  const uploadLabel = t('c:upload_item', { item: t('c:cover').toLowerCase() });

  const openUploadDialog = () => {
    openImageUpload({
      templateId: 'cover',
      organizationId,
      title: uploadLabel,
      onUploaded: (bannerUrl) => {
        setUpload({ url: bannerUrl, replaces: url });
        onCoverUpdate?.(bannerUrl);
      },
    });
  };

  return (
    <div
      data-url={!!coverUrl}
      className={cn('relative flex h-32 bg-center bg-cover', numberToColorClass(id), 'min-h-40 data-[url=true]:h-[20vw] sm:min-w-52')}
      style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}
    >
      {canUpdate && appConfig.has.uploadEnabled && (
        <Button variant="secondary" size="sm" className="relative top-3 mx-auto bg-secondary/80 hover:bg-secondary" onClick={openUploadDialog}>
          <UploadIcon />
          <span>{uploadLabel}</span>
        </Button>
      )}
    </div>
  );
}

export const PageCover = memo(PageCoverBase);
