import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { useLocation } from '@tanstack/react-router';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { updateTask } from '~/api/tasks';
import { dispatchCustomEvent } from '~/lib/custom-events';
import router from '~/lib/router';
import type { Mode } from '~/store/theme';
import { useWorkspaceStore } from '~/store/workspace';

import '~/modules/common/blocknote/styles.css';
import DOMPurify from 'dompurify';
import { BlockNoteForTaskContent } from '~/modules/common/blocknote/blocknote-content';
import { triggerFocus } from '~/modules/common/blocknote/helpers';
import { schemaWithMentions } from '~/modules/common/blocknote/mention';
import { taskExpandable } from '../helpers';

interface TaskBlockNoteProps {
  id: string;
  mode: Mode;
  html: string;
  projectId: string;
  className?: string;
  onChange?: (newContent: string, newSummary: string) => void;
  subTask?: boolean;
}

export const TaskBlockNote = ({ id, html, projectId, mode, onChange, subTask = false, className = '' }: TaskBlockNoteProps) => {
  const initial = useRef(true);
  const editor = useCreateBlockNote({ schema: schemaWithMentions, trailingBlock: false });
  const { pathname } = useLocation();
  const { projects } = useWorkspaceStore();
  const currentProject = projects.find((p) => p.id === projectId);

  const handleUpdateHTML = useCallback(
    async (newContent: string, newSummary: string) => {
      await updateTask(id, 'summary', newSummary);
      const updatedTask = await updateTask(id, 'description', newContent);
      const expandable = taskExpandable(newSummary, newContent);

      if (updatedTask.expandable !== expandable) updateTask(id, 'expandable', expandable);

      const action = updatedTask.parentId ? 'updateSubTask' : 'update';
      const eventName = pathname.includes('/board') ? 'taskCRUD' : 'taskTableCRUD';
      dispatchCustomEvent(eventName, { array: [{ ...updatedTask, expandable }], action });
    },
    [pathname],
  );

  const updateData = async () => {
    //if user in Formatting Toolbar does not update
    if (editor.getSelection()) return;

    const descriptionHtml = await editor.blocksToFullHTML(editor.document);
    const summary = editor.document[0];
    const summaryHTML = await editor.blocksToFullHTML([summary]);
    const cleanSummary = DOMPurify.sanitize(summaryHTML);
    const cleanDescription = DOMPurify.sanitize(descriptionHtml);
    if (onChange) onChange(cleanDescription, cleanSummary);
    else handleUpdateHTML(cleanDescription, cleanSummary);
  };

  useEffect(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // Select all <p class="bn-inline-content"></p> elements
    const emptyPElements = doc.querySelectorAll('p.bn-inline-content');
    // Check if there is exactly one <p> element and it is empty
    const contentEmpty = emptyPElements.length === 1 && emptyPElements[0].textContent === '';

    if (!initial.current && html !== undefined && contentEmpty && html !== '') return;
    const blockUpdate = async (html: string) => {
      const blocks = await editor.tryParseHTMLToBlocks(html);
      editor.replaceBlocks(editor.document, blocks);
      triggerFocus(subTask ? `blocknote-${id}` : `blocknote-subtask-${id}`);
      initial.current = false;
    };
    blockUpdate(html);
  }, [html]);

  useEffect(() => {
    const unsubscribe = router.subscribe('onBeforeLoad', updateData);
    return () => unsubscribe();
  }, []);

  return (
    <Suspense>
      <BlockNoteView
        id={subTask ? `blocknote-${id}` : `blocknote-subtask-${id}`}
        onChange={() => {
          if (!onChange) return;
          updateData();
        }}
        onBlur={updateData}
        editor={editor}
        data-color-scheme={mode}
        className={className}
        sideMenu={false}
        emojiPicker={false}
        formattingToolbar={false}
        slashMenu={false}
      >
        <BlockNoteForTaskContent editor={editor} members={currentProject?.members || []} />
      </BlockNoteView>
    </Suspense>
  );
};