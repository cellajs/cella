import { useEffect, useState } from 'react';
import { createHighlighter } from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { useUIStore } from '~/modules/ui/ui-store';

interface CodeViewerProps {
  code: string;
  language: 'typescript' | 'zod';
}

/**
 * Singleton highlighter using Shiki's JavaScript regex engine (no WASM).
 * The default `codeToHtml` uses the Oniguruma WASM engine, which requires
 * `WebAssembly.instantiate` and is blocked by the app CSP (no 'unsafe-eval').
 */
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;
const getHighlighter = () => {
  highlighterPromise ??= createHighlighter({
    themes: ['github-dark-default', 'github-light-default'],
    langs: ['typescript'],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
};

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
        const highlighter = await getHighlighter();
        const highlighted = highlighter.codeToHtml(code, {
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
    return <div className="h-24 animate-pulse rounded bg-muted" />;
  }

  return (
    <div
      className="text-sm [&_code]:bg-transparent! [&_pre]:bg-transparent!"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is safe
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  );
};
