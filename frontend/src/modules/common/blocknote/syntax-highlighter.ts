import { SyntaxHighlightingExtension } from '@blocknote/core/extensions';
import { createBundledHighlighter, type DynamicImportLanguageRegistration } from '@shikijs/core';
import { createJavaScriptRawEngine } from '@shikijs/engine-javascript/raw';
import type { codeBlockConfig } from 'shared/utils/blocknote-schema-configs';
import { codeTheme } from '~/utils/code-theme';

/** BlockNote never asks a grammar for plain text, so every other language `codeBlockConfig` allows needs one here. */
type HighlightedLanguage = Exclude<keyof typeof codeBlockConfig.supportedLanguages, 'text'>;

/** One precompiled grammar per highlighted language, fetched when a block first shows it. */
const languages: Record<HighlightedLanguage, DynamicImportLanguageRegistration> = {
  html: () => import('@shikijs/langs-precompiled/html'),
  javascript: () => import('@shikijs/langs-precompiled/javascript'),
  json: () => import('@shikijs/langs-precompiled/json'),
  jsonc: () => import('@shikijs/langs-precompiled/jsonc'),
  markdown: () => import('@shikijs/langs-precompiled/markdown'),
  typescript: () => import('@shikijs/langs-precompiled/typescript'),
};
const createHighlighter = createBundledHighlighter({
  langs: languages,
  themes: { [codeTheme.name]: () => Promise.resolve(codeTheme) },
  engine: () => createJavaScriptRawEngine(),
});

/** Highlights code blocks with the theme of the docs and the code viewer. */
export const syntaxHighlighter = SyntaxHighlightingExtension({
  createHighlighter: () => createHighlighter({ themes: [codeTheme.name], langs: [] }),
});
