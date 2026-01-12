import { CheckIcon, HashIcon } from 'lucide-react';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { Button } from '~/modules/ui/button';

interface HashUrlButtonProps {
  id: string;
}

/**
 * A ghost button with a hash icon that copies the current URL with the hash to clipboard.
 * Invisible by default, becomes visible when parent (with group class) is hovered.
 */
export const HashUrlButton = ({ id }: HashUrlButtonProps) => {
  const { copyToClipboard, copied } = useCopyToClipboard();

  const handleCopy = () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${id}`;
    copyToClipboard(url);
  };

  return (
    <Button
      variant="ghost"
      tabIndex={-1}
      size="xs"
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-70 transition-opacity hover:opacity-100"
      aria-label="Copy link to section"
    >
      {copied ? <CheckIcon className="size-3.5 text-success" /> : <HashIcon className="size-3.5" />}
    </Button>
  );
};
