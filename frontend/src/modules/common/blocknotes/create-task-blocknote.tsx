import { Suspense, useEffect } from 'react';
import type { Mode } from '~/store/theme';
import { BlockNoteView } from '@blocknote/shadcn';
import { useCreateBlockNote } from '@blocknote/react';

import './styles.css';

interface TaskEditorProps {
  mode: Mode;
  value: string;
  onChange: (newContent: string, newSummary: string) => void;
}

export const CreateTaskBlockNote = ({ value, mode, onChange }: TaskEditorProps) => {
  const editor = useCreateBlockNote({ trailingBlock: false });

  const updateData = async () => {
    const summary = editor.document[0];
    const summaryHTML = await editor.blocksToHTMLLossy([summary]);
    const contentHtml = await editor.blocksToHTMLLossy(editor.document);
    onChange(contentHtml, summaryHTML);
  };

  useEffect(() => {
    if (value === '') return;
    (async () => {
      const blocks = await editor.tryParseHTMLToBlocks(value);
      editor.replaceBlocks(editor.document, blocks);
    })();
  }, []);

  return (
    <Suspense>
      <BlockNoteView
        onChange={async () => await updateData()}
        editable={true}
        autoFocus={true}
        editor={editor}
        data-color-scheme={mode}
        className="task-blocknote"
        sideMenu={false}
      />
    </Suspense>
  );
};
