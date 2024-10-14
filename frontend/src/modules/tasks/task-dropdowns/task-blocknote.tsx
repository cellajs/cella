import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { useLocation } from '@tanstack/react-router';
import { type KeyboardEventHandler, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { dispatchCustomEvent } from '~/lib/custom-events';
import router from '~/lib/router';
import type { Mode } from '~/store/theme';

import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { customFormattingToolBarConfig, customSchema } from '~/modules/common/blocknote/blocknote-config';
import { Mention } from '~/modules/common/blocknote/custom-elements/mention';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { focusEditor, handleSubmitOnEnter } from '~/modules/common/blocknote/helpers';
import '~/modules/common/blocknote/styles.css';
import { useTaskMutation } from '~/modules/common/query-client-provider/tasks';
import { useWorkspaceQuery } from '~/modules/workspaces/helpers/use-workspace';
import UppyFilePanel from './uppy-file-panel';

interface TaskBlockNoteProps {
  id: string;
  mode: Mode;
  html: string;
  projectId: string;
  className?: string;
  onChange?: (newContent: string) => void;
  taskToClose?: string | null;
  subtask?: boolean;
  onEnterClick?: () => void;
  onEscapeClick?: () => void;
}

export const TaskBlockNote = ({
  id,
  html,
  projectId,
  mode,
  onChange,
  onEnterClick,
  onEscapeClick,
  taskToClose = null,
  subtask = false,
  className = '',
}: TaskBlockNoteProps) => {
  const { t } = useTranslation();
  const editor = useCreateBlockNote({ schema: customSchema, trailingBlock: false });
  const canChangeState = useRef(false);
  const wasInitial = useRef(false);

  const { search } = useLocation();

  const isCreationMode = !!onChange;
  const stateEvent = subtask ? 'changeSubtaskState' : 'changeTaskState';
  const isSheet = !!search.taskIdPreview;

  const {
    data: { members, workspace },
  } = useWorkspaceQuery();

  const taskMutation = useTaskMutation();

  const filePanel = useMemo(() => UppyFilePanel(id), [id]);

  const handleUpdateHTML = useCallback(
    async (newContent: string) => {
      try {
        if (!isSheet) dispatchCustomEvent(stateEvent, { taskId: id, state: 'editing' });
        canChangeState.current = false;
        await taskMutation.mutateAsync({
          id,
          orgIdOrSlug: workspace.organizationId,
          key: 'description',
          data: newContent,
          projectId,
        });
      } catch (err) {
        toast.error(t('common:error.update_resource', { resource: t('app:todo') }));
      }
    },
    [search.taskIdPreview],
  );

  const handleEditorFocus = () => {
    // Remove subtask editing state
    dispatchCustomEvent('changeSubtaskState', { taskId: id, state: 'removeEditing' });
    // Remove Task editing state if focused not task itself
    if (taskToClose) dispatchCustomEvent('changeTaskState', { taskId: taskToClose, state: 'currentState' });
  };
  const updateData = async () => {
    // if user in Formatting Toolbar does not update
    if (editor.getSelection()) return;

    const descriptionHtml = await editor.blocksToFullHTML(editor.document);
    const cleanDescription = DOMPurify.sanitize(descriptionHtml);

    if (isCreationMode) onChange(cleanDescription);
    else await handleUpdateHTML(cleanDescription);
  };

  const handleKeyDown: KeyboardEventHandler = async (event) => {
    if (event.key === 'Escape') onEscapeClick?.();

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      // to ensure that blocknote have description
      if (
        editor.document?.some((block) => {
          const content = block.content;
          return Array.isArray(content) && (content as { text: string }[])[0]?.text.trim() !== '';
        })
      ) {
        const blocksToUpdate = handleSubmitOnEnter(editor);
        if (blocksToUpdate) editor.replaceBlocks(editor.document, blocksToUpdate);
        updateData();
        onEnterClick?.();
      }
    }
  };

  useLayoutEffect(() => {
    if (html === '' && !isCreationMode) return;

    const blockUpdate = async (html: string) => {
      const blocks = await editor.tryParseHTMLToBlocks(html);
      // If the current content is the same as the new content or if this is the initial update, exit early.
      if (wasInitial.current && !isCreationMode) return;
      editor.replaceBlocks(editor.document, blocks);
      // Replace the existing blocks in the editor with the new blocks.
      focusEditor(editor);
      // Set the initial state flag to true to indicate that the first update has occurred.
      wasInitial.current = true;
      // If state change is not allowed yet, allow it now.
      if (!canChangeState.current) canChangeState.current = true;
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
        id={subtask ? `blocknote-subtask-${id}` : `blocknote-${id}`}
        // Defer onChange, onFocus and onBlur  to run after rendering
        onChange={() => {
          if (!isCreationMode && canChangeState.current && !isSheet) dispatchCustomEvent(stateEvent, { taskId: id, state: 'unsaved' });

          // to avoid update if content empty, so from draft shown
          if (!isCreationMode || (html === '' && !subtask)) return;
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
        <CustomSlashMenu editor={editor} />

        <div className="fixed">
          <CustomFormattingToolbar config={customFormattingToolBarConfig} />
        </div>

        {!subtask && <CustomSideMenu />}

        <Mention members={members.filter((m) => m.membership.projectId === projectId)} editor={editor} />

        <GridSuggestionMenuController
          triggerCharacter={':'}
          // Changes the Emoji Picker to only have 5 columns & min length of 0.
          columns={5}
          minQueryLength={0}
        />

        {/* Replaces default file panel with Uppy one. */}
        <FilePanelController filePanel={filePanel} />
      </BlockNoteView>
    </Suspense>
  );
};
