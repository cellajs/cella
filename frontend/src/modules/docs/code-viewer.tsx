import { createHighlighterCore } from '@shikijs/core';
import { createJavaScriptRawEngine } from '@shikijs/engine-javascript/raw';
import { useEffect, useState } from 'react';
import { useUIStore } from '~/modules/ui/ui-store';

interface CodeViewerProps {
  /** TypeScript source, zod schemas included. */
  code: string;
}

/**
 * One grammar and two themes (the editor's code blocks use the same), imported by path so the build emits only those chunks.
 * The grammar comes precompiled, for the raw JavaScript engine: the app CSP allows no WebAssembly, which shiki's Oniguruma engine needs.
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
  // `undefined` while highlighting; `null` when it failed, and the code renders as plain text
  const [html, setHtml] = useState<string | null>();
  const mode = useUIStore((state) => state.mode);

  useEffect(() => {
    let cancelled = false;
    setHtml(undefined);

    const theme = mode === 'dark' ? 'github-dark-default' : 'github-light-default';
    const highlight = async () => {
      try {
        const highlighter = await getHighlighter();
        const highlighted = highlighter.codeToHtml(code, { lang: 'typescript', theme });
        if (!cancelled) setHtml(highlighted);
      } catch {
        if (!cancelled) setHtml(null);
      }
    };

    highlight();
    return () => {
      cancelled = true;
    };
  }, [code, mode]);

  if (html === undefined) {
    return <div className="h-24 animate-pulse rounded bg-muted" />;
  }

  if (html === null) {
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
      className="text-sm [&_pre]:bg-transparent!"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is safe
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
