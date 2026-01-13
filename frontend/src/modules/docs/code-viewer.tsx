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
  const [html, setHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const mode = useUIStore((state) => state.mode);

  useEffect(() => {
    const highlight = async () => {
      setIsLoading(true);
      try {
        const highlighted = await codeToHtml(code, {
          lang: 'typescript',
          theme: mode === 'dark' ? 'github-dark-default' : 'github-light-default',
        });
        setHtml(highlighted);
      } catch {
        // Fallback to plain code if highlighting fails
        setHtml(`<pre><code>${code}</code></pre>`);
      } finally {
        setIsLoading(false);
      }
    };

    highlight();
  }, [code, language, mode]);

  if (isLoading) {
    return <div className="animate-pulse bg-muted rounded h-24" />;
  }

  return (
    <div
      className="text-sm [&_pre]:bg-transparent! [&_code]:bg-transparent!"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is safe
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
