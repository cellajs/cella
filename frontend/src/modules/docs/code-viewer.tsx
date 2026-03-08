import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';
import { useUIStore } from '~/store/ui';

interface CodeViewerProps {
  code: string;
  language: 'typescript' | 'zod';
}

/**
 * Code viewer component using Shiki for syntax highlighting.
 * Supports TypeScript and Zod code display.
 */
export const CodeViewer = ({ code, language }: CodeViewerProps) => {
  const [state, setState] = useState<{ html: string; isLoading: boolean }>({ html: '', isLoading: true });
  const mode = useUIStore((state) => state.mode);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true }));

    const highlight = async () => {
      try {
        const highlighted = await codeToHtml(code, {
          lang: 'typescript',
          theme: mode === 'dark' ? 'github-dark-default' : 'github-light-default',
        });
        if (!cancelled) setState({ html: highlighted, isLoading: false });
      } catch {
        // Fallback to plain code if highlighting fails
        if (!cancelled) setState({ html: `<pre><code>${code}</code></pre>`, isLoading: false });
      }
    };

    highlight();
    return () => {
      cancelled = true;
    };
  }, [code, language, mode]);

  if (state.isLoading) {
    return <div className="animate-pulse bg-muted rounded h-24" />;
  }

  return (
    <div
      className="text-sm [&_pre]:bg-transparent! [&_code]:bg-transparent!"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is safe
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  );
};
