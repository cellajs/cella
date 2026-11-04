import { CopyIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { announce } from '~/modules/common/announce';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { Button } from '~/modules/ui/button';

/** A short value such as an id, in mono, that copies itself on a click. */
export function CopyChip({ value }: { value: string }) {
  const { t } = useTranslation();
  const { copied, copyToClipboard } = useCopyToClipboard();

  const handleCopy = async ({ currentTarget }: MouseEvent<HTMLButtonElement>) => {
    if (await copyToClipboard(value)) announce(currentTarget, t('c:copied'));
  };

  return (
    <Button variant="secondary" size="micro" className="shrink-0 px-1.5 font-mono font-normal" onClick={handleCopy}>
      {value}
      <span className="sr-only">{t('c:copy')}</span>
      <CopiedIcon copied={copied} icon={CopyIcon} />
    </Button>
  );
}
