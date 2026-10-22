import { createHighlighterCore } from '@shikijs/core';
import { createJavaScriptRawEngine } from '@shikijs/engine-javascript/raw';
import { useEffect, useState } from 'react';
import { useUIStore } from '~/modules/ui/ui-store';

interface CodeViewerProps {
  /** TypeScript source, zod schemas included. */
  code: string;
}

/**
 * One grammar and two themes, each imported by path so the build emits only those chunks. The grammar comes with
 * its regular expressions precompiled, so the raw JavaScript engine runs it without a regex compiler; the app CSP
 * allows no WebAssembly, which shiki's Oniguruma engine needs. Same grammar and themes as the editor's code blocks.
 */
let highlighterPromise: ReturnType<typeof createHighlighterCore> | null = null;
const getHighlighter = () => {
  highlighterPromise ??= createHighlighterCore({
    themes: [import('@shikijs/themes/github-dark-default'), import('@shikijs/themes/github-light-default')],
    langs: [import('@shikijs/langs-precompiled/typescript')],
    engine: createJavaScriptRawEngine(),
  });
  return highlighterPromise;
};

export function CodeViewer({ code }: CodeViewerProps) {
  // `html: null` means highlighting failed and the code renders as plain text.
  const [state, setState] = useState<{ html: string | null; isLoading: boolean }>({ html: '', isLoading: true });
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
        if (!cancelled) setState({ html: null, isLoading: false });
      }
    };

    highlight();
    return () => {
      cancelled = true;
    };
  }, [code, mode]);

  if (state.isLoading) {
    return <div className="h-24 animate-pulse rounded bg-muted" />;
  }

  if (state.html === null) {
    return (
      <div className="text-sm">
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div
      className="text-sm [&_code]:bg-transparent! [&_pre]:bg-transparent!"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is safe
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  );
}
