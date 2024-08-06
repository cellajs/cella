import { Suspense, useEffect } from 'react';
import type { Mode } from '~/store/theme';
import { BlockNoteView } from '@blocknote/shadcn';
import { useCreateBlockNote } from '@blocknote/react';

import './styles.css';

interface TaskEditorProps {
  mode: Mode;
  html: string;
  editing: boolean;
  handleUpdateHTML: (newContent: string, newSummary: string) => void;
}

export const TaskBlockNote = ({ html, editing, mode, handleUpdateHTML }: TaskEditorProps) => {
  const editor = useCreateBlockNote({ trailingBlock: false });

  const updateData = async () => {
    const summary = editor.document[0];
    const summaryHTML = await editor.blocksToHTMLLossy([summary]);
    const contentHtml = await editor.blocksToHTMLLossy(editor.document);
    handleUpdateHTML?.(contentHtml, summaryHTML);
  };

  useEffect(() => {
    (async () => {
      const blocks = await editor.tryParseHTMLToBlocks(html);
      const showedBlock = editing ? blocks : [blocks[0]];
      editor.replaceBlocks(editor.document, showedBlock);
    })();
  }, [editing]);

  return (
    <Suspense>
      <BlockNoteView
        onBlur={async () => await updateData()}
        editable={editing}
        autoFocus={editing}
        editor={editor}
        data-color-scheme={mode}
        className="task-blocknote"
        sideMenu={false}
      />
    </Suspense>
  );
};
