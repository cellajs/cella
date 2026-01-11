import { CheckIcon, CopyIcon } from 'lucide-react';
import { type FC, useState } from 'react';

interface CopyButtonProps {
  value: unknown;
  isVisible: boolean;
}

/**
 * Copy-to-clipboard button that appears on hover.
 * Shows a checkmark briefly after successful copy.
 */
export const CopyButton: FC<CopyButtonProps> = ({ value, isVisible }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center bg-transparent border-none cursor-pointer p-0.5 ml-1 rounded transition-opacity hover:bg-black/10 dark:hover:bg-white/10 ${isVisible ? 'opacity-60 hover:opacity-100' : 'opacity-0'}`}
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
    </button>
  );
};
