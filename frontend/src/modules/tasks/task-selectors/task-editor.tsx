import MDEditor from '@uiw/react-md-editor';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Mode } from '~/store/theme';

interface TaskEditorProps {
  id: string;
  mode: Mode;
  markdown: string;
  handleUpdateMarkdown: (newValue: string) => void;
  className?: string;
}

export const TaskEditor = ({ markdown, handleUpdateMarkdown, id, mode, className }: TaskEditorProps) => {
  const { t } = useTranslation();
  const [markdownValue, setMarkdownValue] = useState(markdown);

  const handleMDEscKeyPress: React.KeyboardEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (event.key !== 'Escape' && !(event.key === 'Enter' && (event.ctrlKey || event.metaKey))) return;
      const editorTextAria = document.getElementById(`text-area-${id}`);
      if (!editorTextAria) return;
      editorTextAria.blur();
    },
    [handleUpdateMarkdown],
  );

  // Textarea autofocus cursor on the end of the value
  useEffect(() => {
    const editorTextAria = document.getElementById(`text-area-${id}`);
    if (!editorTextAria) return;
    const textAreaElement = editorTextAria as HTMLTextAreaElement;
    if (markdown) textAreaElement.value = markdown;
    textAreaElement.focus();
    textAreaElement.setSelectionRange(textAreaElement.value.length, textAreaElement.value.length);
  }, [id]);

  return (
    <div className={className || ''}>
      <MDEditor
        onBlur={() => handleUpdateMarkdown(markdownValue)}
        onKeyDown={handleMDEscKeyPress}
        textareaProps={{ id: `text-area-${id}`, placeholder: t('common:placeholder.mdEditor') }}
        value={markdownValue}
        preview={'edit'}
        onChange={(newValue) => {
          if (typeof newValue === 'string') setMarkdownValue(newValue);
        }}
        defaultTabEnable={true}
        hideToolbar={true}
        visibleDragbar={false}
        height={'auto'}
        minHeight={20}
        style={{ color: mode === 'dark' ? '#F2F2F2' : '#17171C', background: 'transparent', boxShadow: 'none', padding: '0' }}
      />
    </div>
  );
};
