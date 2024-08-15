import { Suspense, useEffect, useRef } from 'react';
import type { Mode } from '~/store/theme';
import { BlockNoteView } from '@blocknote/shadcn';
import { useCreateBlockNote } from '@blocknote/react';
import { useWorkspaceStore } from '~/store/workspace';

import '~/modules/common/blocknote/styles.css';
import { schemaWithMentions } from '~/modules/common/blocknote/mention';
import { triggerFocus } from '~/modules/common/blocknote/helpers';
import { BlockNoteForTaskContent } from '~/modules/common/blocknote/blocknote-content';

interface TaskEditorProps {
  id: string;
  mode: Mode;
  value: string;
  projectId: string;
  onChange: (newContent: string, newSummary: string) => void;
}

export const CreateTaskBlockNote = ({ id, value, projectId, mode, onChange }: TaskEditorProps) => {
  const editor = useCreateBlockNote({ schema: schemaWithMentions, trailingBlock: false });
  const { projects } = useWorkspaceStore();
  const currentProject = projects.find((p) => p.id === projectId);
  const initial = useRef(true);

  const updateData = async () => {
    const summary = editor.document[0];
    const summaryHTML = await editor.blocksToHTMLLossy([summary]);
    const contentHtml = await editor.blocksToHTMLLossy(editor.document);
    onChange(contentHtml, summaryHTML);
  };

  useEffect(() => {
    if (!initial.current && value !== undefined && value !== '<p class="bn-inline-content"></p>' && value !== '') return;
    (async () => {
      const blocks = await editor.tryParseHTMLToBlocks('');
      editor.replaceBlocks(editor.document, blocks);
      triggerFocus(`create-blocknote-${id}`);
      initial.current = false;
    })();
  }, [value]);

  return (
    <Suspense>
      <BlockNoteView
        id={`create-blocknote-${id}`}
        onChange={updateData}
        editable={true}
        autoFocus={true}
        editor={editor}
        data-color-scheme={mode}
        className="task-blocknote"
        sideMenu={false}
        emojiPicker={false}
      >
        <BlockNoteForTaskContent editor={editor} members={currentProject?.members || []} />
      </BlockNoteView>
    </Suspense>
  );
};
