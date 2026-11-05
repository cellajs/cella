import { ImageUpIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { openImageUpload } from '~/modules/common/uploader/open-image-upload';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { placeholderColorClass } from '~/utils/placeholder-color-class';

export interface PageCoverProps {
  id: string;
  canUpdate: boolean;
  url?: string | null;
  organizationId?: string;
  onCoverUpdate?: (bannerKey: string) => void;
  onCoverDelete?: () => void;
}

function PageCoverBase({ id, canUpdate, organizationId, url, onCoverUpdate, onCoverDelete }: PageCoverProps) {
  const { t } = useTranslation();
  // A fresh upload shows at once and holds until `url` moves: to the saved cover, or to one written elsewhere
  const [upload, setUpload] = useState<{ url: string; replaces: PageCoverProps['url'] } | null>(null);
  const coverUrl = upload && upload.replaces === url ? upload.url : url;

  const uploadLabel = t(coverUrl ? 'c:change_resource' : 'c:upload_resource', { resource: t('c:cover') });

  const openUploadDialog = () => {
    openImageUpload({
      templateId: 'cover',
      organizationId,
      title: uploadLabel,
      onUploaded: (bannerUrl) => {
        setUpload({ url: bannerUrl, replaces: url });
        onCoverUpdate?.(bannerUrl);
      },
      onDelete:
        coverUrl && onCoverDelete
          ? () => {
              // Else a cover uploaded over no cover shows again once `url` is back to null
              setUpload(null);
              onCoverDelete();
            }
          : undefined,
    });
  };

  return (
    <div
      data-url={!!coverUrl}
      className={cn('relative flex h-32 bg-cover bg-center', placeholderColorClass(id), 'min-h-40 data-[url=true]:h-[20vw] sm:min-w-52')}
      style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}
    >
      {canUpdate && appConfig.has.uploadEnabled && (
        <Button
          variant="outline-ghost"
          size="xs"
          className="bg-background/50 hover:bg-background/75 dark:bg-background/75 absolute top-4 right-4 backdrop-blur-xs max-sm:size-10"
          onClick={openUploadDialog}
        >
          <ImageUpIcon />
          <span className="max-sm:sr-only">{uploadLabel}</span>
        </Button>
      )}
    </div>
  );
}

export const PageCover = memo(PageCoverBase);
