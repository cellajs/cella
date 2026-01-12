import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

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

  useEffect(() => {
    const highlight = async () => {
      setIsLoading(true);
      try {
        const highlighted = await codeToHtml(code, {
          lang: 'typescript',
          theme: 'github-dark-default',
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
  }, [code, language]);

  if (isLoading) {
    return <div className="animate-pulse bg-muted rounded h-24" />;
  }

  return (
    <div
      className="text-sm overflow-x-auto [&_pre]:bg-transparent! [&_pre]:p-0! [&_pre]:m-0! [&_code]:bg-transparent!"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is safe
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
