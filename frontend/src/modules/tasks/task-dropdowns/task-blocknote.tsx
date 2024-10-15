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
import { FloatingPortal } from '@floating-ui/react';
import { useTaskMutation } from '~/modules/common/query-client-provider/tasks';
import * as Badge from '~/modules/ui/badge';
import * as Button from '~/modules/ui/button';
import * as Card from '~/modules/ui/card';
import * as DropdownMenu from '~/modules/ui/dropdown-menu';
import * as Input from '~/modules/ui/input';
import * as Label from '~/modules/ui/label';
import * as Popover from '~/modules/ui/popover';
import * as Select from '~/modules/ui/select';
import * as Tabs from '~/modules/ui/tabs';
import * as Toggle from '~/modules/ui/toggle';
import * as Tooltip from '~/modules/ui/tooltip';
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
        shadCNComponents={{ Button, DropdownMenu, Popover, Tooltip, Select, Label, Input, Card, Badge, Toggle, Tabs }}
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
        <FloatingPortal>
          <div className="bn-ui-container">
            <CustomSlashMenu editor={editor} />
          </div>
        </FloatingPortal>

        <FloatingPortal>
          <div className="bn-ui-container">
            <CustomFormattingToolbar config={customFormattingToolBarConfig} />
          </div>
        </FloatingPortal>

        {!subtask && <CustomSideMenu />}

        <FloatingPortal>
          <div className="bn-ui-container">
            <Mention members={members.filter((m) => m.membership.projectId === projectId)} editor={editor} />
          </div>
        </FloatingPortal>

        <FloatingPortal>
          <div className="bn-ui-container">
            <GridSuggestionMenuController triggerCharacter={':'} columns={5} minQueryLength={0} />
          </div>
        </FloatingPortal>

        {/* Replaces default file panel with Uppy one. */}
        <FilePanelController filePanel={filePanel} />
      </BlockNoteView>
    </Suspense>
  );
};
