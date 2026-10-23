import { CopyIcon } from 'lucide-react';
import { type ComponentProps, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { Button } from '~/modules/ui/button';

/** Build-time Shiki-highlighted `<pre>` (vite.config.ts) with a hover copy button that reads the rendered text. */
export function CodeBlock({ children, ...props }: ComponentProps<'pre'>) {
  const { t } = useTranslation();
  const preRef = useRef<HTMLPreElement>(null);
  const { copyToClipboard, copied } = useCopyToClipboard();

  return (
    <div className="group/code-block relative my-5">
      <pre ref={preRef} {...props}>
        {children}
      </pre>
      <Button
        variant="ghost"
        size="micro"
        tabIndex={-1}
        aria-label={t('c:copy')}
        onClick={() => copyToClipboard(preRef.current?.textContent ?? '')}
        className="absolute top-2 right-2 size-7 border bg-background/80 p-0 opacity-0 backdrop-blur-sm transition-opacity group-hover/code-block:opacity-100"
      >
        <CopiedIcon copied={copied} icon={CopyIcon} />
      </Button>
    </div>
  );
}
