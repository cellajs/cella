import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';

import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { SquareIcon } from 'lucide-react';
import { type KeyboardEvent, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { getDictionary } from '~/modules/common/blocknote/helpers/dictionary';
import { shadCNComponents } from '~/modules/common/blocknote/helpers/shad-cn';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';

interface ChatInputProps {
  onSend: (content: string) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onStop, isLoading, disabled }: ChatInputProps) {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);

  // Use refs for values accessed inside capture handler to avoid stale closures
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const editor = useCreateBlockNote({
    schema: customSchema,
    trailingBlock: false,
    dictionary: getDictionary(),
  });

  const handleSend = useCallback(() => {
    if (editor.isEmpty || isLoadingRef.current || disabledRef.current) return;
    const markdown = editor.blocksToMarkdownLossy(editor.document);
    const trimmed = markdown.trim();
    if (!trimmed) return;
    onSendRef.current(trimmed);
    editor.replaceBlocks(editor.document, [{ type: 'paragraph' }]);
  }, [editor]);

  // Capture phase intercepts Enter before ProseMirror processes it
  const handleKeyDownCapture = useCallback(
    (e: KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return;

      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="shrink-0 border-t bg-card">
      <div onKeyDownCapture={handleKeyDownCapture} className="bn-ai-chat p-3">
        <BlockNoteView
          theme={mode}
          editor={editor}
          editable={!disabled}
          sideMenu={false}
          slashMenu={false}
          formattingToolbar={false}
          emojiPicker={false}
          filePanel={false}
          shadCNComponents={shadCNComponents}
          data-color-scheme={mode}
        />
      </div>
      {isLoading && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onStop}
          className="absolute right-1 bottom-1 h-7 w-7"
          aria-label={t('c:stop')}
        >
          <SquareIcon size={14} />
        </Button>
      )}
    </div>
  );
}
