import type { Editor as CoreEditor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';
import type React from 'react';

export interface MenuProps {
  editor: Editor;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  appendTo?: React.RefObject<any>;
  shouldHide?: boolean;
}

export interface ShouldShowProps {
  editor?: CoreEditor;
  view: EditorView;
  state?: EditorState;
  oldState?: EditorState;
  from?: number;
  to?: number;
}
