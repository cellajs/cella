import { Link } from '@tanstack/react-router';
import { CopyCheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { ButtonGroup } from '~/modules/ui/button-group';

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
  const isMobile = useBreakpointBelow('sm', false);

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

  const iconSize = 16;
  const size = smallMode ? 'sm' : 'default';

  return (
    <ButtonGroup className={className}>
      {/* View */}
      {viewerUrl && (
        <TooltipButton toolTipContent={t('common:view')}>
          <Button variant="outline" size={size} className="gap-2 flex-none" asChild>
            <Link
              resetScroll
              to={viewerUrl}
              onClick={() => {
                isMobile && useSheeter.getState().remove();
                // Scroll the docs main content area to top (resetScroll only handles window scroll)
                requestAnimationFrame(() => document.querySelector('main')?.scrollTo({ top: 0 }));
              }}
            >
              <span className={smallMode ? 'text-xs' : undefined}>json</span>
            </Link>
          </Button>
        </TooltipButton>
      )}
      {/* Open */}
      <TooltipButton toolTipContent={t('common:open')}>
        <Button
          variant="outline"
          size={size}
          className="gap-2 flex-none"
          aria-label={t('common:open')}
          onClick={handleOpen}
        >
          <ExternalLinkIcon size={iconSize} />
          {!smallMode && <span className="max-lg:hidden">{t('common:open')}</span>}
        </Button>
      </TooltipButton>
      {/* Copy */}
      <TooltipButton toolTipContent={t('common:copy')}>
        <Button variant="outline" size={size} className="gap-2" aria-label={t('common:copy')} onClick={handleCopy}>
          {copied ? <CopyCheckIcon size={iconSize} /> : <CopyIcon size={iconSize} />}
          {!smallMode && <span className="max-lg:hidden">{t('common:copy')}</span>}
        </Button>
      </TooltipButton>
      {/* Download */}
      <TooltipButton toolTipContent={t('common:download')}>
        <Button
          variant="outline"
          size={size}
          className="gap-2 flex-none"
          aria-label={t('common:download')}
          disabled={isInProgress}
          onClick={handleDownload}
        >
          {isInProgress ? <Spinner className="size-4" noDelay /> : <DownloadIcon size={iconSize} />}
          {!smallMode && <span className="max-lg:hidden">{t('common:download')}</span>}
        </Button>
      </TooltipButton>
    </ButtonGroup>
  );
};
