import { SyntaxHighlightingExtension } from '@blocknote/core/extensions';
import { createBundledHighlighter, type DynamicImportLanguageRegistration } from '@shikijs/core';
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import type { codeBlockConfig } from 'shared/utils/blocknote-schema-configs';

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

// BlockNote picks the light and dark theme by the words in their names.
const createHighlighter = createBundledHighlighter({
  langs: languages,
  themes: {
    'github-dark-default': () => import('@shikijs/themes/github-dark-default'),
    'github-light-default': () => import('@shikijs/themes/github-light-default'),
  },
  engine: () => createJavaScriptRegexEngine(),
});

/** Highlights code blocks with the theme pair of the docs and the code viewer. */
export const syntaxHighlighter = SyntaxHighlightingExtension({
  createHighlighter: () => createHighlighter({ themes: ['github-dark-default', 'github-light-default'], langs: [] }),
});
