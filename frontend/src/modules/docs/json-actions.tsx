import { CopyIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useDownloader } from '~/hooks/use-downloader';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { ButtonGroup } from '~/modules/ui/button-group';

interface JsonActionsProps {
  url: string;
  /** The JSON value the copy button writes to the clipboard. */
  data: unknown;
  filename: string;
  /** Names what was copied in the success toast. */
  resourceName: string;
  className?: string;
}

export function JsonActions({ url, data, filename, resourceName, className }: JsonActionsProps) {
  const { t } = useTranslation();

  const { copyToClipboard, copied } = useCopyToClipboard();
  const { download, isInProgress } = useDownloader();

  const handleCopy = () => {
    copyToClipboard(JSON.stringify(data, null, 2));
    toaster.success(t('c:success.copy_resource', { resource: resourceName }));
  };

  const handleOpen = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <ButtonGroup className={className}>
      <TooltipButton toolTipContent={t('c:docs.open_in_new_tab')}>
        <Button variant="outline" className="flex-none" aria-label={t('c:docs.open_in_new_tab')} onClick={handleOpen}>
          <ExternalLinkIcon />
          <span className="max-lg:hidden">{t('c:open')}</span>
        </Button>
      </TooltipButton>
      <TooltipButton toolTipContent={t('c:docs.copy_json')}>
        <Button variant="outline" aria-label={t('c:docs.copy_json')} onClick={handleCopy}>
          <CopiedIcon copied={copied} icon={CopyIcon} />
          <span className="max-lg:hidden">{t('c:copy')}</span>
        </Button>
      </TooltipButton>
      <TooltipButton toolTipContent={t('c:docs.download_json')}>
        <Button
          variant="outline"
          className="flex-none"
          aria-label={t('c:docs.download_json')}
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
