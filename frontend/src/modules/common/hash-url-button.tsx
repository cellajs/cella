import { HashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface HashUrlButtonProps {
  /** Section id, without `#`. */
  hash: string;
  /** Path, search and hash, for a section shown away from its page. */
  href?: string;
  className?: string;
}

/** Copies the link to a section of the current page. Invisible until the parent carrying `group/hash-url` is hovered. */
export function HashUrlButton({ hash, href, className }: HashUrlButtonProps) {
  const { t } = useTranslation();
  const { copyToClipboard, copied } = useCopyToClipboard();

  return (
    <Button
      variant="ghost"
      tabIndex={-1}
      size="xs"
      onClick={() => copyToClipboard(`${window.location.origin}${href ?? `${window.location.pathname}${window.location.search}#${hash}`}`)}
      className={cn('opacity-0 transition-opacity group-hover/hash-url:opacity-70 hover:opacity-100', className)}
      aria-label={t('c:copy_link')}
    >
      <CopiedIcon copied={copied} icon={HashIcon} />
    </Button>
  );
}
