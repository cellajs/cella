import { CheckIcon, CopyIcon } from 'lucide-react';
import { type ComponentProps, useRef } from 'react';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { Button } from '~/modules/ui/button';

/**
 * Docs code block: the Shiki-highlighted `<pre>` (build-time, vite.config.ts) wrapped
 * with a hover copy button. The raw text is read from the rendered element rather than
 * reconstructed from the token spans. The incoming `<pre>` already carries the `shiki`
 * class; styling of `pre.shiki` lives in styling/tailwind.css.
 */
export function CodeBlock({ children, ...props }: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null);
  const { copyToClipboard, copied } = useCopyToClipboard();

  return (
    <div className="group relative my-5">
      <pre ref={ref} {...props}>
        {children}
      </pre>
      <Button
        variant="ghost"
        size="micro"
        tabIndex={-1}
        aria-label="Copy code"
        onClick={() => copyToClipboard(ref.current?.textContent ?? '')}
        className="absolute top-2 right-2 h-7 w-7 border border-border bg-background/80 p-0 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
      >
        {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
      </Button>
    </div>
  );
}
