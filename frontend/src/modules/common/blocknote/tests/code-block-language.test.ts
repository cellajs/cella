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

describe('code block language', () => {
  afterEach(() => {
    for (const editor of mounted.splice(0)) editor.unmount();
    document.body.replaceChildren();
  });

  // BlockNote 0.55 threw on such a block and took down a task card on raak.dev (cella#1411).
  it('must not throw on a stored language outside the supported list: editor and static HTML show it as plain text, and it stays stored', () => {
    const { editor, element } = mount({ schema: customSchema, initialContent: [codeBlock('dotenv')] });

    expect(element.querySelector('select')?.value).toBe('text');
    expect(element.querySelector('pre')?.textContent).toBe('KEY=value');
    expect(editor.document[0].props).toMatchObject({ language: 'dotenv' });

    const headless = BlockNoteEditor.create({ schema: customSchema, _headless: true });
    expect(headless.blocksToFullHTML([codeBlock('dotenv')])).toContain('KEY=value');

    const { highlight } = customSchema.blockSpecs.codeBlock.implementation.meta ?? {};
    expect(highlight?.({ type: 'codeBlock', props: { language: 'dotenv' } })).toBe('text');
  });

  it('highlights every supported language but plain text', async () => {
    const languages = Object.keys(codeBlockConfig.supportedLanguages);
    const { element } = mount({
      schema: customSchema,
      initialContent: languages.map((language) => ({ ...codeBlock(language), id: language })),
      extensions: [syntaxHighlighter],
    });
    const tokens = (language: string) => element.querySelectorAll(`[data-id="${language}"] code span[style*="color"]`).length;

    await vi.waitFor(() => {
      for (const language of languages.filter((language) => language !== 'text')) expect(tokens(language), language).toBeGreaterThan(0);
    });
    expect(tokens('text')).toBe(0);
  });
});
