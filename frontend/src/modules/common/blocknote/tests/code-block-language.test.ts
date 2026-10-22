// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { codeBlockConfig } from 'shared/utils/blocknote-schema-configs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { syntaxHighlighter } from '~/modules/common/blocknote/syntax-highlighter';

const codeBlock = (language: string) => ({ type: 'codeBlock' as const, props: { language }, content: 'KEY=value' });

const mounted: { unmount: () => void }[] = [];

const mount = (options: Parameters<typeof BlockNoteEditor.create>[0]) => {
  const editor = BlockNoteEditor.create(options);
  const element = document.createElement('div');
  document.body.appendChild(element);
  editor.mount(element);
  mounted.push(editor);
  return { editor, element };
};

const mountCodeBlock = (language: string) => mount({ schema: customSchema, initialContent: [codeBlock(language)] });

describe('code block language', () => {
  afterEach(() => {
    for (const editor of mounted.splice(0)) editor.unmount();
    document.body.replaceChildren();
  });

  it('mounts a stored language outside the supported list as plain text and keeps it stored', () => {
    const { editor, element } = mountCodeBlock('dotenv');

    expect(element.querySelector('select')?.value).toBe('text');
    expect(element.querySelector('pre')?.textContent).toBe('KEY=value');
    expect(editor.document[0].props).toMatchObject({ language: 'dotenv' });
  });

  it('renders the static HTML of a stored language outside the supported list', () => {
    const headless = BlockNoteEditor.create({ schema: customSchema, _headless: true });

    expect(headless.blocksToFullHTML([codeBlock('dotenv')])).toContain('KEY=value');
  });

  it('highlights a stored language outside the supported list as plain text', () => {
    const { highlight } = customSchema.blockSpecs.codeBlock.implementation.meta ?? {};

    expect(highlight?.({ type: 'codeBlock', props: { language: 'dotenv' } })).toBe('text');
    expect(highlight?.({ type: 'codeBlock', props: { language: 'typescript' } })).toBe('typescript');
  });

  it('highlights and selects a stored alias as the language it names, keeping the alias stored', () => {
    const { highlight } = customSchema.blockSpecs.codeBlock.implementation.meta ?? {};
    const { editor, element } = mountCodeBlock('ts');

    expect(highlight?.({ type: 'codeBlock', props: { language: 'ts' } })).toBe('typescript');
    expect(highlight?.({ type: 'codeBlock', props: { language: 'MD' } })).toBe('markdown');
    expect(highlight?.({ type: 'codeBlock', props: { language: 'txt' } })).toBe('text');
    expect(element.querySelector('select')?.value).toBe('typescript');
    expect(editor.document[0].props).toMatchObject({ language: 'ts' });
  });

  it('selects a supported language', () => {
    const { element } = mountCodeBlock('typescript');

    expect(element.querySelector('select')?.value).toBe('typescript');
  });

  it('highlights every supported language but plain text', async () => {
    const languages = Object.keys(codeBlockConfig.supportedLanguages);
    const { element } = mount({
      schema: customSchema,
      initialContent: languages.map((language) => ({ ...codeBlock(language), id: language })),
      extensions: [syntaxHighlighter],
    });
    const tokens = (language: string) => element.querySelectorAll(`[data-id="${language}"] code span[style*="--shiki-dark"]`).length;

    await vi.waitFor(() => {
      for (const language of languages.filter((language) => language !== 'text')) expect(tokens(language), language).toBeGreaterThan(0);
    });
    expect(tokens('text')).toBe(0);
  });
});
