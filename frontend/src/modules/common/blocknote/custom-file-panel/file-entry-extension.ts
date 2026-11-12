import { createExtension, type ExtensionOptions } from '@blocknote/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { type AttachmentMedia, insertFiles } from '~/modules/common/blocknote/custom-file-panel/file-insertion';
import { countRenderedLines, fileFromPastedText, isStructuredText } from '~/modules/common/blocknote/helpers/pasted-text';
import type { AnyBlockNoteEditor } from '~/modules/common/blocknote/types';

const pluginKey = new PluginKey('file-entry');

interface FileEntryOptions {
  /** The editor's media while files become attachment rows, read per event: a host's `persist` changes between renders. */
  getMedia: () => AttachmentMedia | undefined;
  /** The most lines pasted text may add before it becomes a file. */
  getMaxLines: () => number;
}

/** The formats BlockNote pastes as content. With one on the clipboard, a file beside it is a picture of that content (a copied spreadsheet cell). */
const contentFormats = ['blocknote/html', 'text/markdown', 'text/html', 'text/plain', 'vscode-editor-data'];

const filesOf = (data: DataTransfer | null): File[] => (data && !contentFormats.some((format) => data.types.includes(format)) ? [...data.files] : []);

/**
 * The pasted text that becomes a file, if any. Structured data always does. Other text does once it would add more
 * lines than `maxLines` at the width of the block the cursor is in, and only when the clipboard holds it as plain text
 * or as code from an editor: formatted text (HTML) is content the person arranges, and stays text. Never blocks copied
 * from an editor of the app, and never in a code block, where pasted text is the code.
 */
const textForFile = (editor: AnyBlockNoteEditor, data: DataTransfer | null, maxLines: number): string | undefined => {
  const text = data?.getData('text/plain');
  if (!data || !text || data.types.includes('blocknote/html')) return undefined;
  const { block } = editor.getTextCursorPosition();
  if (block.type === 'codeBlock') return undefined;
  if (isStructuredText(text)) return text;
  if (data.types.includes('text/html') && !data.types.includes('vscode-editor-data')) return undefined;
  const blockElement = editor.domElement?.querySelector<HTMLElement>(`[data-id="${block.id}"] .bn-block-content`);
  return countRenderedLines(text, blockElement, maxLines) > maxLines ? text : undefined;
};

/** The block a drop lands on and the side of it: above the block's middle goes before it. A drop on no block goes after the last. */
const dropTarget = (editor: AnyBlockNoteEditor, event: DragEvent) => {
  const element = event.target instanceof Element ? event.target.closest('[data-id]') : null;
  const blockId = element?.getAttribute('data-id');
  if (!element || !blockId) {
    const last = editor.document[editor.document.length - 1];
    return last ? ({ blockId: last.id, placement: 'after' } as const) : undefined;
  }
  const { top, bottom } = element.getBoundingClientRect();
  return { blockId, placement: event.clientY < (top + bottom) / 2 ? 'before' : 'after' } as const;
};

/**
 * How files and long text enter a document that keeps attachment rows. It takes a paste or a drop ahead of BlockNote's
 * own handlers, which insert and upload file by file: every file of it goes through one upload (`insertFiles`), and
 * pasted text that would flood the document becomes a file.
 */
export const fileEntryExtension = createExtension(({ editor, options }: ExtensionOptions<FileEntryOptions>) => ({
  key: 'fileEntry' as const,
  prosemirrorPlugins: [
    new Plugin({
      key: pluginKey,
      props: {
        handleDOMEvents: {
          paste: (_view, event) => {
            const media = options.getMedia();
            if (!media || !editor.isEditable) return false;

            const files = filesOf(event.clipboardData);
            const text = files.length === 0 ? textForFile(editor, event.clipboardData, options.getMaxLines()) : undefined;
            const pasted = text ? [fileFromPastedText(text)] : files;
            if (pasted.length === 0) return false;

            event.preventDefault();
            void insertFiles(editor, pasted, media);
            return true;
          },
          drop: (_view, event) => {
            const media = options.getMedia();
            const files = filesOf(event.dataTransfer);
            if (!media || !editor.isEditable || files.length === 0) return false;

            event.preventDefault();
            void insertFiles(editor, files, media, dropTarget(editor, event));
            return true;
          },
        },
      },
    }),
  ],
}));
