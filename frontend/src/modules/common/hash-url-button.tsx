import { CheckIcon, HashIcon } from 'lucide-react';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { Button } from '~/modules/ui/button';

interface HashUrlButtonProps {
  url: string;
}

/**
 * A ghost button with a hash icon that copies a URL to the clipboard.
 * Invisible by default, becomes visible when parent (with group class) is hovered.
 */
export const HashUrlButton = ({ url }: HashUrlButtonProps) => {
  const { copyToClipboard, copied } = useCopyToClipboard();

  return (
    <Button
      variant="ghost"
      tabIndex={-1}
      size="xs"
      onClick={() => copyToClipboard(url)}
      className="opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-70"
      aria-label="Copy link"
    >
      {copied ? <CheckIcon className="size-3.5 text-success" /> : <HashIcon className="size-3.5" />}
    </Button>
  );
};
