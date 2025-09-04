import { CopyCheckIcon, CopyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { Button } from '~/modules/ui/button';

export const TOPTManualKey = ({ manualKey }: { manualKey?: string }) => {
  const { t } = useTranslation();
  const { copyToClipboard, copied } = useCopyToClipboard();

  if (!manualKey) return null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="font-semibold">{t('common:totp_manual.title')}</h3>
      <p className="text-sm">{t('common:totp_manual.description')}</p>
      <div className="flex items-center justify-between bg-card gap-2 text-card-foreground rounded-lg border rounded px-3 py-2 font-mono text-lg">
        <span>{manualKey}</span>{' '}
        <Button
          variant="cell"
          size="icon"
          className="h-full w-full"
          aria-label="Copy"
          data-tooltip="true"
          data-tooltip-content={copied ? t('common:copied') : t('common:copy')}
          onClick={() => copyToClipboard(manualKey)}
        >
          {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
        </Button>
      </div>
      <p className="text-xs text-gray-500">{t('common:totp_manual.secure_text')}</p>
    </div>
  );
};
