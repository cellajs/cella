import { CheckIcon, CopyIcon } from 'lucide-react';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';

interface CopyButtonProps {
  value: unknown;
}

export function CopyButton({ value }: CopyButtonProps) {
  const { copied, copyToClipboard } = useCopyToClipboard(2000);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(JSON.stringify(value, null, 2));
  };

  return (
    <button
      type="button"
      className="ml-1 inline-flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-0.5 opacity-0 transition-opacity hover:bg-black/10 hover:opacity-100 group-hover/node:opacity-60 dark:hover:bg-white/10"
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? <CheckIcon className="icon-xs" /> : <CopyIcon className="icon-xs" />}
    </button>
  );
}
