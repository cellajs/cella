import MDEditor from '@uiw/react-md-editor';
import { useCallback, useEffect, useState } from 'react';
import type { Mode } from '~/store/theme';
import { useHotkeys } from '~/hooks/use-hot-keys';

interface TaskEditorProps {
  markdown: string;
  setMarkdown: (newValue: string) => void;
  id: string;
  mode: Mode;
  toggleEditorState: () => void;
}

export const TaskEditor = ({ markdown, setMarkdown, id, mode, toggleEditorState }: TaskEditorProps) => {
  const [markdownValue, setMarkdownValue] = useState(markdown);
  const handleUpdateMarkdown = () => {
    const editorTextAria = document.getElementById(id);
    if (!editorTextAria) return toggleEditorState();
    const newValue = (editorTextAria as HTMLTextAreaElement).value;
    setMarkdown(newValue);
    toggleEditorState();
  };

  const handleMDEscKeyPress: React.KeyboardEventHandler<HTMLDivElement> = useCallback((event) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && event.ctrlKey) || (event.key === 'Enter' && event.metaKey)) handleUpdateMarkdown();
  }, []);

  const handleHotKeys = useCallback(() => {
    handleUpdateMarkdown();
  }, []);

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
        onKeyDown={handleMDEscKeyPress}
        onBlur={() => {
          setMarkdown(markdownValue);
          toggleEditorState();
        }}
        textareaProps={{ id: id }}
        value={markdownValue}
        preview={'edit'}
        onChange={(newValue) => {
          if (newValue) setMarkdownValue(newValue);
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
