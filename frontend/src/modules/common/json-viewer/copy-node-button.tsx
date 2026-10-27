import { CopyIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { CopiedIcon } from '~/modules/common/copied-icon';

interface CopyNodeButtonProps {
  value: unknown;
}

export function CopyNodeButton({ value }: CopyNodeButtonProps) {
  const { t } = useTranslation();
  const { copied, copyToClipboard } = useCopyToClipboard(2000);

  const handleCopy = (event: MouseEvent) => {
    event.stopPropagation();
    copyToClipboard(JSON.stringify(value, null, 2));
  };

  return (
    <button
      type="button"
      className="focus-effect ml-1 inline-flex cursor-pointer items-center justify-center rounded p-0.5 opacity-0 transition-opacity hover:bg-muted hover:opacity-100 focus-visible:opacity-100 group-hover/node:opacity-60"
      onClick={handleCopy}
      aria-label={t('c:copy')}
      title={t('c:copy')}
    >
      <CopiedIcon copied={copied} icon={CopyIcon} />
    </button>
  );
}
