import { Suspense, useCallback, useEffect, useRef } from 'react';
import type { Mode } from '~/store/theme';
import { BlockNoteView } from '@blocknote/shadcn';
import { useCreateBlockNote } from '@blocknote/react';
import { useWorkspaceStore } from '~/store/workspace';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { updateTask } from '~/api/tasks';
import { useLocation } from '@tanstack/react-router';
import router from '~/lib/router';

import '~/modules/common/blocknote/styles.css';
import { schemaWithMentions } from '~/modules/common/blocknote/mention';
import { triggerFocus } from '~/modules/common/blocknote/helpers';
import { BlockNoteForTaskContent } from '~/modules/common/blocknote/blocknote-content';
import DOMPurify from 'dompurify';

interface TaskEditorProps {
  id: string;
  mode: Mode;
  html: string;
  projectId: string;
}

export const TaskBlockNote = ({ id, html, projectId, mode }: TaskEditorProps) => {
  const initial = useRef(true);
  const editor = useCreateBlockNote({ schema: schemaWithMentions, trailingBlock: false });
  const { pathname } = useLocation();
  const { projects } = useWorkspaceStore();
  const currentProject = projects.find((p) => p.id === projectId);

  const handleUpdateHTML = useCallback(
    async (newContent: string, newSummary: string) => {
      await updateTask(id, 'summary', newSummary);
      const updatedTask = await updateTask(id, 'description', newContent);

      const action = updatedTask.parentId ? 'updateSubTask' : 'update';
      const eventName = pathname.includes('/board') ? 'taskCRUD' : 'taskTableCRUD';
      dispatchCustomEvent(eventName, { array: [updatedTask], action });
    },
    [pathname],
  );

  const updateData = async () => {
    //if user in Formatting Toolbar does not update
    if (editor.getSelection()) return;

    //remove empty lines
    const content = editor.document.filter((d) => !(d.type === 'paragraph' && Array.isArray(d.content) && !d.content.length));
    const descriptionHtml = await editor.blocksToHTMLLossy(content);
    if (html === descriptionHtml && !editor.getSelection()) return editor.replaceBlocks(editor.document, content);
    const summary = editor.document[0];
    const summaryHTML = await editor.blocksToHTMLLossy([summary]);
    const cleanSummary = DOMPurify.sanitize(summaryHTML);
    const cleanDescription = DOMPurify.sanitize(descriptionHtml);
    handleUpdateHTML(cleanDescription, cleanSummary);
  };

  useEffect(() => {
    const blockUpdate = async (html: string) => {
      if (!initial.current) return;
      const blocks = await editor.tryParseHTMLToBlocks(html);
      editor.replaceBlocks(editor.document, blocks);
      triggerFocus(`blocknote-${id}`);
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
        id={`blocknote-${id}`}
        onBlur={updateData}
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
