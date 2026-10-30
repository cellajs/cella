import type { HighlighterCore, ThemedToken } from '@shikijs/core';
import { useEffect, useState } from 'react';
import { CodeBlockContent } from '~/modules/ui/code-block';
import { codeTheme } from '~/utils/code-theme';

interface CodeViewerProps {
  /** TypeScript source, zod schemas included. */
  code: string;
}

/**
 * One grammar, imported by path so the build emits only its chunk.
 * The grammar comes precompiled, for the raw JavaScript engine: the app CSP allows no WebAssembly, which shiki's Oniguruma engine needs.
 * Imported on first use: shiki and its grammars load when a code view opens, not with the docs route.
 */
let highlighterPromise: Promise<HighlighterCore> | null = null;
const getHighlighter = () => {
  highlighterPromise ??= Promise.all([import('@shikijs/core'), import('@shikijs/engine-javascript/raw')]).then(
    ([{ createHighlighterCore }, { createJavaScriptRawEngine }]) =>
      createHighlighterCore({
        themes: [codeTheme],
        langs: [import('@shikijs/langs-precompiled/typescript')],
        engine: createJavaScriptRawEngine(),
      }),
  );
  return highlighterPromise;
};

// Shiki's FontStyle flag, written out so the enum does not pull its package into the docs route
const italicBit = 1;

export function CodeViewer({ code }: CodeViewerProps) {
  // Undefined while highlighting or after it failed: plain text takes the highlighted code's height, so the panel keeps its size
  const [lines, setLines] = useState<ThemedToken[][]>();

  useEffect(() => {
    let cancelled = false;
    setLines(undefined);

    const highlight = async () => {
      try {
        const highlighter = await getHighlighter();
        const { tokens } = highlighter.codeToTokens(code, { lang: 'typescript', theme: codeTheme.name });
        if (!cancelled) setLines(tokens);
      } catch {
        // The code stays plain text
      }
    };

    highlight();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    // The viewer's panel scrolls and pads every view alike, so a switch between them keeps the text in place
    <CodeBlockContent className="overflow-visible p-0">
      <code>
        {lines
          ? lines.map((line, lineIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines and tokens have no identity beyond their position.
              <span key={lineIndex}>
                {lineIndex > 0 && '\n'}
                {line.map((token, tokenIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines and tokens have no identity beyond their position.
                  <span key={tokenIndex} style={{ color: token.color, fontStyle: italicBit & (token.fontStyle ?? 0) ? 'italic' : undefined }}>
                    {token.content}
                  </span>
                ))}
              </span>
            ))
          : code}
      </code>
    </CodeBlockContent>
  );
}
