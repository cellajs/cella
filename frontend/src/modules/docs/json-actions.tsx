import { Link } from '@tanstack/react-router';
import { CopyCheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { cn } from '~/utils/cn';
import { useSheeter } from '../common/sheeter/use-sheeter';

interface JsonActionsProps {
  url: string;
  data: unknown;
  filename?: string;
  resourceName?: string;
  className?: string;
  smallMode?: boolean;
  viewerUrl?: string;
}

/**
 * Reusable action buttons for JSON resources: open in new tab, copy to clipboard, and download.
 */
export const JsonActions = ({
  url,
  data,
  filename = 'data.json',
  resourceName,
  className,
  smallMode,
  viewerUrl,
}: JsonActionsProps) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const { copyToClipboard, copied } = useCopyToClipboard();
  const { download, isInProgress } = useDownloader();

  const handleCopy = () => {
    copyToClipboard(JSON.stringify(data, null, 2));
    toaster(t('common:success.resource_copied', { resource: resourceName ?? 'JSON' }), 'success');
  };

  const handleDownload = () => {
    if (!isInProgress) {
      download(url, filename);
    }
  };

  const handleOpen = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const iconSize = smallMode ? 14 : 16;
  const size = smallMode ? 'xs' : 'default';

  return (
    <ToggleGroup type="single" variant="merged" data-small-mode={smallMode} className={cn('gap-0', className)}>
      {/* View */}
      {viewerUrl && (
        <ToggleGroupItem value="view" aria-label={t('common:view')} className="gap-2 flex-none" size={size} asChild>
          <Link
            to={viewerUrl}
            onClick={() => {
              isMobile && useSheeter.getState().remove();
            }}
          >
            <span className="group-data-[small-mode=true]/toggle-group:text-xs">{filename}</span>
          </Link>
        </ToggleGroupItem>
      )}
      {/* Open */}
      <ToggleGroupItem
        value="open"
        aria-label={t('common:open')}
        className="gap-2 flex-none"
        size={size}
        onClick={handleOpen}
      >
        <ExternalLinkIcon size={iconSize} />
        <span className="max-lg:hidden group-data-[small-mode=true]/toggle-group:hidden">{t('common:open')}</span>
      </ToggleGroupItem>
      {/* Copy */}
      <ToggleGroupItem value="copy" aria-label={t('common:copy')} className="gap-2" size={size} onClick={handleCopy}>
        {copied ? <CopyCheckIcon size={iconSize} /> : <CopyIcon size={iconSize} />}
        <span className="max-lg:hidden group-data-[small-mode=true]/toggle-group:hidden">{t('common:copy')}</span>
      </ToggleGroupItem>
      {/* Download */}
      <ToggleGroupItem
        value="download"
        aria-label={t('common:download')}
        className="gap-2 flex-none"
        size={size}
        disabled={isInProgress}
        onClick={handleDownload}
      >
        {isInProgress ? <Spinner className="size-4" noDelay /> : <DownloadIcon size={iconSize} />}
        <span className="max-lg:hidden group-data-[small-mode=true]/toggle-group:hidden">{t('common:download')}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
};
