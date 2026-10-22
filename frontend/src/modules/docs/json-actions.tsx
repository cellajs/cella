import { CopyCheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useDownloader } from '~/hooks/use-downloader';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { ButtonGroup } from '~/modules/ui/button-group';

interface JsonActionsProps {
  url: string;
  data: unknown;
  filename: string;
  resourceName?: string;
  className?: string;
}

export function JsonActions({ url, data, filename, resourceName, className }: JsonActionsProps) {
  const { t } = useTranslation();

  const { copyToClipboard, copied } = useCopyToClipboard();
  const { download, isInProgress } = useDownloader();

  const handleCopy = () => {
    copyToClipboard(JSON.stringify(data, null, 2));
    toaster.success(t('c:success.resource_copied', { resource: resourceName ?? 'JSON' }));
  };

  const handleOpen = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <ButtonGroup className={className}>
      <TooltipButton toolTipContent={t('c:open')}>
        <Button variant="outline" className="flex-none gap-2" aria-label={t('c:open')} onClick={handleOpen}>
          <ExternalLinkIcon />
          <span className="max-lg:hidden">{t('c:open')}</span>
        </Button>
      </TooltipButton>
      <TooltipButton toolTipContent={t('c:copy')}>
        <Button variant="outline" className="gap-2" aria-label={t('c:copy')} onClick={handleCopy}>
          {copied ? <CopyCheckIcon /> : <CopyIcon />}
          <span className="max-lg:hidden">{t('c:copy')}</span>
        </Button>
      </TooltipButton>
      <TooltipButton toolTipContent={t('c:download')}>
        <Button
          variant="outline"
          className="flex-none gap-2"
          aria-label={t('c:download')}
          disabled={isInProgress}
          onClick={() => download(url, filename)}
        >
          {isInProgress ? <Spinner size="sm" noDelay /> : <DownloadIcon />}
          <span className="max-lg:hidden">{t('c:download')}</span>
        </Button>
      </TooltipButton>
    </ButtonGroup>
  );
}
