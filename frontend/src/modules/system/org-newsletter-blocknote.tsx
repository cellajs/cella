import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import DOMPurify from 'dompurify';
import { Suspense, useEffect, useRef } from 'react';
import { cn } from '~/lib/utils';
import { useThemeStore } from '~/store/theme';

import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { CustomFormattingToolbar } from '~/modules/common/blocknote/custom-formatting-toolbar';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { triggerFocus } from '~/modules/common/blocknote/helpers';

interface BlockNoteProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const BlockNote = ({ value, onChange, className = '' }: BlockNoteProps) => {
  const editor = useCreateBlockNote({ schema: customSchema, trailingBlock: false });

  const { mode } = useThemeStore();
  const initial = useRef(true);
  const onBlockNoteChange = async () => {
    // Converts the editor's contents from Block objects to HTML
    const html = await editor.blocksToHTMLLossy(editor.document);
    const cleanHtml = DOMPurify.sanitize(html);
    return cleanHtml;
  };

  useEffect(() => {
    if (!initial.current || value === undefined || value === '') return;
    const blockUpdate = async (html: string) => {
      const blocks = await editor.tryParseHTMLToBlocks(html);
      editor.replaceBlocks(editor.document, blocks);
      triggerFocus('blocknote-org-letter');
      initial.current = false;
    };
    blockUpdate(value);
  }, [value]);

  return (
    <Suspense>
      <BlockNoteView
        id={'blocknote-org-letter'}
        data-color-scheme={mode}
        editor={editor}
        defaultValue={value}
        onChange={async () => onChange(await onBlockNoteChange())}
        sideMenu={false}
        formattingToolbar={false}
        className={cn('p-2 border rounded-lg', className)}
      >
        <CustomSlashMenu editor={editor} />
        <CustomFormattingToolbar />
      </BlockNoteView>
    </Suspense>
  );
};

export default BlockNote;
