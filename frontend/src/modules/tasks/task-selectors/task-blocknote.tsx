import { FilePanelController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { useLocation } from '@tanstack/react-router';
import { type KeyboardEventHandler, Suspense, useCallback, useEffect, useLayoutEffect } from 'react';
import { updateTask } from '~/api/tasks';
import { dispatchCustomEvent } from '~/lib/custom-events';
import router from '~/lib/router';
import type { Mode } from '~/store/theme';
import { useWorkspaceStore } from '~/store/workspace';

import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { customSchema } from '~/modules/common/blocknote/blackbote-config';
import { BlockNoteForTaskContent } from '~/modules/common/blocknote/blocknote-content';
import { triggerFocus } from '~/modules/common/blocknote/helpers';
import '~/modules/common/blocknote/styles.css';
import { taskExpandable } from '~/modules/tasks/helpers';
import UppyFilePanel from './uppy-file-panel';

interface TaskBlockNoteProps {
  id: string;
  mode: Mode;
  html: string;
  projectId: string;
  className?: string;
  onChange?: (newContent: string, newSummary: string) => void;
  taskToClose?: string | null;
  subTask?: boolean;
  callback?: () => void;
}

export const TaskBlockNote = ({
  id,
  html,
  projectId,
  mode,
  onChange,
  callback,
  taskToClose = null,
  subTask = false,
  className = '',
}: TaskBlockNoteProps) => {
  const { t } = useTranslation();
  const editor = useCreateBlockNote({ schema: customSchema, trailingBlock: false });

  const { pathname } = useLocation();
  const { members } = useWorkspaceStore();

  const handleUpdateHTML = useCallback(
    async (newContent: string, newSummary: string) => {
      try {
        await updateTask(id, 'summary', newSummary);
        const updatedTask = await updateTask(id, 'description', newContent);
        const expandable = taskExpandable(newSummary, newContent);

        if (updatedTask.expandable !== expandable) updateTask(id, 'expandable', expandable);

        const action = updatedTask.parentId ? 'updateSubTask' : 'update';
        const eventName = pathname.includes('/board') ? 'taskOperation' : 'taskTableOperation';
        dispatchCustomEvent(eventName, { array: [{ ...updatedTask, expandable }], action, projectId: updatedTask.projectId });
      } catch (err) {
        toast.error(t('common:error.update_resource', { resource: t('app:todo') }));
      }
    },
    [pathname],
  );

  const handleEditorFocus = () => {
    // Remove subTask editing state
    dispatchCustomEvent('toggleSubTaskEditing', { id, state: false });
    // Remove Task editing state if focused not task itself
    if (taskToClose) dispatchCustomEvent('toggleTaskEditing', { id: taskToClose, state: false });
  };

  const updateData = async () => {
    //if user in Formatting Toolbar does not update
    if (editor.getSelection()) return;

    const descriptionHtml = await editor.blocksToFullHTML(editor.document);
    // find first block with text in it
    const summary = editor.document.find((el) => Array.isArray(el.content) && (el.content as { text: string }[])[0]?.text.trim() !== '');
    const summaryHTML = await editor.blocksToFullHTML([summary ?? editor.document[0]]);
    const cleanSummary = DOMPurify.sanitize(summaryHTML);
    const cleanDescription = DOMPurify.sanitize(descriptionHtml);
    if (onChange) onChange(cleanDescription, cleanSummary);
    else handleUpdateHTML(cleanDescription, cleanSummary);
  };

  const handleKeyDown: KeyboardEventHandler = async (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      const blocks = editor.document;
      // to ensure that blocknote have description
      if (
        blocks?.some((block) => {
          const content = block.content;
          return Array.isArray(content) && (content as { text: string }[])[0]?.text.trim() !== '';
        })
      ) {
        // Get the last block and modify its content so we remove last \n
        const lastBlock = blocks[blocks.length - 1];
        if (Array.isArray(lastBlock.content)) {
          const lastBlockContent = lastBlock.content as { text: string }[];
          if (lastBlockContent.length > 0) lastBlockContent[0].text = lastBlockContent[0].text.replace(/\n$/, ''); // Remove the last newline character
          const updatedLastBlock = { ...lastBlock, content: lastBlockContent };
          // Replace blocks with the updated last block
          editor.replaceBlocks(editor.document, [...blocks.slice(0, -1), updatedLastBlock] as typeof editor.document);
        }

        updateData();
        callback?.();
      }
    }
  };

  useLayoutEffect(() => {
    const blockUpdate = async (html: string) => {
      const blocks = await editor.tryParseHTMLToBlocks(html);
      const currentBlocks = editor.document.map((block) => block.content).join('');
      const newBlocksContent = blocks.map((block) => block.content).join('');

      // Only replace blocks if the content actually changes
      if (currentBlocks !== newBlocksContent || html === '') {
        editor.replaceBlocks(editor.document, blocks);
        triggerFocus(subTask ? `blocknote-${id}` : `blocknote-subtask-${id}`);
      }
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
        // Defer onChange, onFocus and onBlur  to run after rendering
        onChange={() => {
          // to avoid update if content empty, so from draft shown
          if (!onChange || editor.document[0].content?.toString() === '') return;
          queueMicrotask(() => updateData());
        }}
        onFocus={() => queueMicrotask(() => handleEditorFocus())}
        onBlur={() => queueMicrotask(() => updateData())}
        onKeyDown={handleKeyDown}
        editor={editor}
        data-color-scheme={mode}
        theme={mode}
        className={className}
        sideMenu={false}
        emojiPicker={false}
        formattingToolbar={false}
        slashMenu={false}
        filePanel={false}
      >
        <BlockNoteForTaskContent editor={editor} members={members.filter((m) => m.membership.projectId === projectId)} subTask={subTask} />
        {/* Replaces default file panel with Uppy one. */}
        <FilePanelController filePanel={UppyFilePanel} />
      </BlockNoteView>
    </Suspense>
  );
};
