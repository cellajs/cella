import { CopyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { Button } from '~/modules/ui/button';

/** A secret the user copies or types once: shown in full, wrapping, selectable, with a copy button. */
export function SecretBox({ value }: { value: string }) {
  const { t } = useTranslation();
  const { copied, copyToClipboard } = useCopyToClipboard();

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed bg-background py-1 pr-1 pl-3 font-mono text-sm">
      <div className="min-w-0 grow select-all break-all">{value}</div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={t('c:copy')}
        data-tooltip="true"
        data-tooltip-content={copied ? t('c:copied') : t('c:copy')}
        onClick={() => copyToClipboard(value)}
      >
        <CopiedIcon copied={copied} icon={CopyIcon} />
      </Button>
    </div>
  );
}
