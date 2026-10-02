import { CheckIcon, CopyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';

interface CopyButtonProps {
  value: unknown;
}

export function CopyButton({ value }: CopyButtonProps) {
  const { t } = useTranslation();
  const { copied, copyToClipboard } = useCopyToClipboard(2000);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(JSON.stringify(value, null, 2));
  };

  return (
    <button
      type="button"
      className="focus-effect ml-1 inline-flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-0.5 opacity-0 transition-opacity hover:bg-foreground/10 hover:opacity-100 focus-visible:opacity-100 group-hover/node:opacity-60"
      onClick={handleCopy}
      aria-label={t('c:copy')}
      title={t('c:copy')}
    >
      {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
    </button>
  );
}
