import { CopyIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { announce } from '~/modules/common/announce';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { Button } from '~/modules/ui/button';

interface CodeCopyButtonProps {
  /** The text to copy, or a getter for text that exists only once rendered. */
  value: string | (() => string);
}

/** Copies code and reads the result out to a screen reader. */
export function CodeCopyButton({ value }: CodeCopyButtonProps) {
  const { t } = useTranslation();
  const { copied, copyToClipboard } = useCopyToClipboard();

  const handleCopy = async ({ currentTarget }: MouseEvent<HTMLButtonElement>) => {
    const done = await copyToClipboard(typeof value === 'string' ? value : value());
    if (done) announce(currentTarget, t('c:copied'));
  };

  return (
    <Button variant="outline" size="micro" aria-label={t('c:copy')} className="size-7 p-0" onClick={handleCopy}>
      <CopiedIcon copied={copied} icon={CopyIcon} />
    </Button>
  );
}
