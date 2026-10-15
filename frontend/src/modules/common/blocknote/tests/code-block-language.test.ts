// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { afterEach, describe, expect, it } from 'vitest';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';

const codeBlock = (language: string) => ({ type: 'codeBlock' as const, props: { language }, content: 'KEY=value' });

const mounted: { unmount: () => void }[] = [];

const mountCodeBlock = (language: string) => {
  const editor = BlockNoteEditor.create({ schema: customSchema, initialContent: [codeBlock(language)] });
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

  it('selects a supported language', () => {
    const { element } = mountCodeBlock('typescript');

    expect(element.querySelector('select')?.value).toBe('typescript');
  });
});
