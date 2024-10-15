import { FilePanelController, GridSuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { useLocation } from '@tanstack/react-router';
import { type KeyboardEventHandler, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dispatchCustomEvent } from '~/lib/custom-events';
import router from '~/lib/router';
import type { Mode } from '~/store/theme';

import DOMPurify from 'dompurify';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { Block } from '@blocknote/core';
import { customFormattingToolBarConfig, customSchema } from '~/modules/common/blocknote/blocknote-config';
import { Mention } from '~/modules/common/blocknote/custom-elements/mention';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar';
import { CustomSideMenu } from '~/modules/common/blocknote/custom-side-menu';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { focusEditor, getContentAsString, handleSubmitOnEnter } from '~/modules/common/blocknote/helpers';
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
import { handleEditorFocus, trimInlineContentText } from '../helpers';
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
  const { search } = useLocation();
  const editor = useCreateBlockNote({ schema: customSchema, trailingBlock: false });
  const wasInitial = useRef(false);
  const isCreationMode = !!onChange;

  const [text, setText] = useState<string>('');

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
        const contentToUpdate = trimInlineContentText(newContent);
        if (!isSheet) dispatchCustomEvent(stateEvent, { taskId: id, state: 'editing' });
        await taskMutation.mutateAsync({
          id,
          orgIdOrSlug: workspace.organizationId,
          key: 'description',
          data: contentToUpdate,
          projectId,
        });
      } catch (err) {
        toast.error(t('common:error.update_resource', { resource: t('app:todo') }));
      }
    },
    [search.taskIdPreview],
  );

  const updateData = async () => {
    // if user in Formatting Toolbar does not update
    if (editor.getSelection()) return;
    await handleUpdateHTML(text);
  };

  const onTextChange = useCallback(async () => {
    // Converts the editor's contents from Block objects to Markdown and store to state.
    const descriptionHtml = await editor.blocksToFullHTML(editor.document);
    const cleanDescription = DOMPurify.sanitize(descriptionHtml);

    const newHtml = getContentAsString(editor.document as Block[]);
    const oldHtml = getContentAsString((await editor.tryParseHTMLToBlocks(html)) as Block[]);

    if (isCreationMode) onChange(cleanDescription);

    if (!isSheet && oldHtml !== newHtml) dispatchCustomEvent(stateEvent, { taskId: id, state: 'unsaved' });
    setText(cleanDescription);
  }, []);

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

  const blockUpdate = async (html: string) => {
    const blocks = await editor.tryParseHTMLToBlocks(html);
    if (html === '' || wasInitial.current) return;
    editor.replaceBlocks(editor.document, blocks);
    const descriptionHtml = await editor.blocksToFullHTML(editor.document);
    setText(descriptionHtml);
    focusEditor(editor);
    wasInitial.current = true;
  };
  const blockCreationUpdate = async (html: string) => {
    const blocks = await editor.tryParseHTMLToBlocks(html);
    const innerText = getContentAsString(blocks as Block[]);
    if (innerText === '' && html === '' && text === '') return;
    editor.replaceBlocks(editor.document, blocks);
    focusEditor(editor);
  };

  useEffect(() => {
    if (isCreationMode) blockCreationUpdate(html);
    else blockUpdate(html);
  }, [html]);

  useEffect(() => {
    const unsubscribe = router.subscribe('onBeforeLoad', updateData);
    return () => unsubscribe();
  }, []);

  return (
    <Suspense>
      <BlockNoteView
        id={subtask ? `blocknote-subtask-${id}` : `blocknote-${id}`}
        onChange={onTextChange}
        onFocus={() => handleEditorFocus(id, taskToClose)}
        onBlur={updateData}
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
