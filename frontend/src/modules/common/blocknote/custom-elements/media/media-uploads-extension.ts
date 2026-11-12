import { createExtension, createStore } from '@blocknote/core';
import type { AnyBlockNoteEditor } from '~/modules/common/blocknote/types';

interface MediaUploadsState {
  /** Blocks whose file is uploading from this editor: each shows its file name and a spinner until the upload ends. */
  uploading: ReadonlySet<string>;
  /** Empty blocks an "Add files" press made for the upload dialog: one still empty when the dialog closes is removed. */
  added: ReadonlySet<string>;
}

/** What this editor is doing with its media blocks, kept beside the document: none of it is stored or synced. */
export const mediaUploadsExtension = createExtension(() => ({
  key: 'mediaUploads' as const,
  store: createStore<MediaUploadsState>({ uploading: new Set(), added: new Set() }),
}));

export const flagBlocks = (editor: AnyBlockNoteEditor, flag: keyof MediaUploadsState, blockIds: string[], on: boolean) => {
  editor.getExtension(mediaUploadsExtension)?.store.setState((state) => {
    const next = new Set(state[flag]);
    for (const id of blockIds) {
      if (on) next.add(id);
      else next.delete(id);
    }
    return { ...state, [flag]: next };
  });
};

export const isFlagged = (editor: AnyBlockNoteEditor, flag: keyof MediaUploadsState, blockId: string): boolean =>
  editor.getExtension(mediaUploadsExtension)?.store.state[flag].has(blockId) ?? false;
