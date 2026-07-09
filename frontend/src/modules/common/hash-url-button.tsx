import { CheckIcon, HashIcon } from 'lucide-react';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface HashUrlButtonProps {
  url: string;
  className?: string;
}

/**
 * A ghost button with a hash icon that copies a URL to the clipboard.
 * Invisible by default, becomes visible when parent (with group class) is hovered.
 */
export const HashUrlButton = ({ url, className }: HashUrlButtonProps) => {
  const { copyToClipboard, copied } = useCopyToClipboard();

  return (
    <Button
      variant="ghost"
      tabIndex={-1}
      size="xs"
      onClick={() => copyToClipboard(url)}
      className={cn('opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-70', className)}
      aria-label="Copy link"
    >
      {copied ? <CheckIcon className="size-3.5 text-success" /> : <HashIcon className="size-3.5" />}
    </Button>
  );
};
