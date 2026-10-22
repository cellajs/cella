import { HashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface HashUrlButtonProps {
  url: string;
  className?: string;
}

/** Copies a URL to the clipboard. Invisible until the parent carrying `group` is hovered. */
export function HashUrlButton({ url, className }: HashUrlButtonProps) {
  const { t } = useTranslation();
  const { copyToClipboard, copied } = useCopyToClipboard();

  return (
    <Button
      variant="ghost"
      tabIndex={-1}
      size="xs"
      onClick={() => copyToClipboard(url)}
      className={cn('opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-70', className)}
      aria-label={t('c:copy_link')}
    >
      <CopiedIcon copied={copied} icon={HashIcon} />
    </Button>
  );
}
