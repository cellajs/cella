import MDEditor from '@uiw/react-md-editor';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from '~/hooks/use-hot-keys';
import type { Mode } from '~/store/theme';

interface TaskEditorProps {
  id: string;
  mode: Mode;
  markdown: string;
  setMarkdown: (newValue: string) => void;
  setSummary: (newValue: string) => void;
  toggleEditorState: () => void;
}

export const TaskEditor = ({ markdown, setMarkdown, setSummary, id, mode, toggleEditorState }: TaskEditorProps) => {
  const { t } = useTranslation();
  const [markdownValue, setMarkdownValue] = useState(markdown);

  const handleUpdateMarkdown = () => {
    const summaryFromMarkDown = markdownValue.split('\n')[0];
    setMarkdown(markdownValue);
    setSummary(summaryFromMarkDown);
    toggleEditorState();
  };

  const handleMDEscKeyPress: React.KeyboardEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (event.key !== 'Escape' && !(event.key === 'Enter' && (event.ctrlKey || event.metaKey))) return;
      handleUpdateMarkdown();
    },
    [handleUpdateMarkdown],
  );

  const handleHotKeys = useCallback(() => {
    handleUpdateMarkdown();
  }, [handleUpdateMarkdown]);

  useHotkeys([
    ['Escape', handleHotKeys],
    ['ctrl+enter', handleHotKeys],
    ['meta+enter', handleHotKeys],
  ]);

  // Textarea autofocus cursor on the end of the value
  useEffect(() => {
    const editorTextAria = document.getElementById(id);
    if (!editorTextAria) return;
    const textAreaElement = editorTextAria as HTMLTextAreaElement;
    if (markdown) textAreaElement.value = markdown;
    textAreaElement.focus();
    textAreaElement.setSelectionRange(textAreaElement.value.length, textAreaElement.value.length);
  }, [id]);

  return (
    <>
      <MDEditor
        onBlur={handleUpdateMarkdown}
        onKeyDown={handleMDEscKeyPress}
        textareaProps={{ id: id, placeholder: t('common:placeholder.mdEditor') }}
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
    </>
  );
};
