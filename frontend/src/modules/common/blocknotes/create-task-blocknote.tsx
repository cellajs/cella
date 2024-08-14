import { Suspense, useEffect, useRef } from 'react';
import type { Mode } from '~/store/theme';
import { BlockNoteView } from '@blocknote/shadcn';
import { GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { useWorkspaceStore } from '~/store/workspace';

import './styles.css';
import { getMentionMenuItems, schemaWithMentions } from './mention';

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

  const triggerFocus = () => {
    const editorContainerElement = document.getElementById(`create-blocknote-${id}`);
    const editorElement = editorContainerElement?.getElementsByClassName('bn-editor');
    if (editorElement?.length) (editorElement[0] as HTMLDivElement).focus();
  };

  useEffect(() => {
    if (!initial.current && value !== undefined && value !== '<p class="bn-inline-content"></p>' && value !== '') return;
    (async () => {
      const blocks = await editor.tryParseHTMLToBlocks('');
      editor.replaceBlocks(editor.document, blocks);
      if (initial.current) {
        triggerFocus();
        initial.current = false;
      }
    })();
  }, [value]);

  return (
    <Suspense>
      <BlockNoteView
        id={`create-blocknote-${id}`}
        onChange={async () => await updateData()}
        editable={true}
        autoFocus={true}
        editor={editor}
        data-color-scheme={mode}
        className="task-blocknote"
        sideMenu={false}
        emojiPicker={false}
      >
        <GridSuggestionMenuController
          triggerCharacter={'@'}
          getItems={async () =>
            getMentionMenuItems(currentProject?.members || [], editor).map((item) => ({
              ...item,
              title: item.id,
            }))
          }
          columns={2}
          minQueryLength={0}
        />
        <GridSuggestionMenuController
          triggerCharacter={':'}
          // Changes the Emoji Picker to only have 10 columns & min length of 0.
          columns={10}
          minQueryLength={0}
        />
      </BlockNoteView>
    </Suspense>
  );
};
