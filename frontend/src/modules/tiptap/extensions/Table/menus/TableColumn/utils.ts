import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';

import { Table } from '../..';
import { isTableSelected } from '../../utils';

export const isColumnGripSelected = ({
  editor,
  view,
  state,
  from,
}: {
  editor: Editor;
  view: EditorView;
  state: EditorState;
  from: number;
}) => {
  const domAtPos = view.domAtPos(from).node as HTMLElement;
  const nodeDOM = view.nodeDOM(from) as HTMLElement;
  const node = nodeDOM || domAtPos;

  if (!editor.isActive(Table.name) || !node || isTableSelected(state.selection)) {
    return false;
  }

  let container = node;

  while (container && !['TD', 'TH'].includes(container.tagName)) {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    container = container.parentElement!;
  }

  const gripColumn = container?.querySelector?.('a.grip-column.selected');

  return !!gripColumn;
};

export default isColumnGripSelected;
