import { useEffect, useState } from 'react';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';
import { bundledThemes } from 'shiki/themes';
import { useUIStore } from '~/modules/ui/ui-store';

interface CodeViewerProps {
  code: string;
  language: 'typescript' | 'zod';
}

/**
 * Built from `shiki/core` with the themes and grammar named explicitly. The `shiki` entry bundles
 * every engine, which places the Oniguruma WASM build on the boot path; the app CSP has no
 * 'unsafe-eval', so the JavaScript regex engine is always the one used.
 */
let highlighterPromise: ReturnType<typeof createHighlighterCore> | null = null;
const getHighlighter = () => {
  highlighterPromise ??= createHighlighterCore({
    themes: [bundledThemes['github-dark-default'], bundledThemes['github-light-default']],
    langs: [bundledLanguages.typescript],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
};

export function CodeViewer({ code, language }: CodeViewerProps) {
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
}
