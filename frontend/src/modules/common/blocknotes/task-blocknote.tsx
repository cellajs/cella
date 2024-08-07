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
  html: string;
  projectId: string;
  handleUpdateHTML: (newContent: string, newSummary: string) => void;
}

export const TaskBlockNote = ({ id, html, projectId, mode, handleUpdateHTML }: TaskEditorProps) => {
  const editor = useCreateBlockNote({ schema: schemaWithMentions, trailingBlock: false });
  const initial = useRef(true);

  const { projects, focusedTaskId } = useWorkspaceStore();
  const currentProject = projects.find((p) => p.id === projectId);

  const updateData = async () => {
    //if user in Formatting Toolbar does not update
    if (editor.getSelection()) return;

    //remove empty lines
    const content = editor.document.filter((d) => Array.isArray(d.content) && d.content.length);
    const contentHtml = await editor.blocksToHTMLLossy(content);
    if (html === contentHtml && !editor.getSelection()) return editor.replaceBlocks(editor.document, content);
    const summary = editor.document[0];
    const summaryHTML = await editor.blocksToHTMLLossy([summary]);
    handleUpdateHTML?.(contentHtml, summaryHTML);
  };

  const triggerFocus = () => {
    const editorContainerElement = document.getElementById(`blocknote-${id}`);
    const editorElement = editorContainerElement?.getElementsByClassName('bn-editor');
    if (editorElement?.length) (editorElement[0] as HTMLDivElement).focus();
  };

  useEffect(() => {
    (async () => {
      const blocks = await editor.tryParseHTMLToBlocks(html);
      editor.replaceBlocks(editor.document, blocks);
      if (initial.current) {
        triggerFocus();
        initial.current = false;
      }
    })();
  }, [html]);

  useEffect(() => {
    if (focusedTaskId !== id) return;
    triggerFocus();
  }, [focusedTaskId]);

  return (
    <Suspense>
      <BlockNoteView
        id={`blocknote-${id}`}
        onBlur={async () => await updateData()}
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
