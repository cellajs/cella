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
import { useTaskMutation } from '~/modules/common/query-client-provider/tasks';
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
