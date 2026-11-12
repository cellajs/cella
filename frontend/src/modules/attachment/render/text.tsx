import { useEffect, useState } from 'react';
import type { MediaPlayerProps } from '~/modules/attachment/render/attachment-render';
import { Spinner } from '~/modules/common/spinner';
import { cn } from '~/utils/cn';

/** The largest text file the viewer shows; a larger one is left to the download. */
const maxTextBytes = 512 * 1024;

/**
 * A text file as text: plain text, Markdown, CSV, JSON. Throws for a file it cannot read and for one past
 * `maxTextBytes`, which the viewer's error boundary answers with the download.
 */
export function RenderText({ src, className }: MediaPlayerProps) {
  const [loaded, setLoaded] = useState<{ src: string; text: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(src)
      .then(async (response) => {
        const blob = response.ok ? await response.blob() : null;
        return blob && blob.size <= maxTextBytes ? blob.text() : null;
      })
      .catch(() => null)
      .then((text) => {
        if (active) setLoaded({ src, text });
      });
    return () => {
      active = false;
    };
  }, [src]);

  if (loaded?.src !== src) return <Spinner size="lg" />;
  if (loaded.text === null) throw new Error('The text file cannot be shown');

  return (
    <pre
      className={cn('bg-card text-card-foreground overflow-auto rounded-md border p-4 font-mono text-sm whitespace-pre-wrap select-text', className)}
    >
      {loaded.text}
    </pre>
  );
}
