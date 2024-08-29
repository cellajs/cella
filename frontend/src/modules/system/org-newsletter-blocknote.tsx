import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import DOMPurify from 'dompurify';
import { Suspense } from 'react';
import { cn } from '~/lib/utils';
import { useThemeStore } from '~/store/theme';

import '~/modules/common/blocknote/styles.css';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { CustomFormattingToolbar } from '../common/blocknote/custom-formatting-toolbar';

interface BlockNoteProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const BlockNote = ({ value, onChange, className = '' }: BlockNoteProps) => {
  const editor = useCreateBlockNote();
  const { mode } = useThemeStore();
  const onBlockNoteChange = async () => {
    // Converts the editor's contents from Block objects to HTML
    const html = await editor.blocksToHTMLLossy(editor.document);
    const cleanHtml = DOMPurify.sanitize(html);
    return cleanHtml;
  };

  return (
    <Suspense>
      <BlockNoteView
        data-color-scheme={mode}
        editor={editor}
        defaultValue={value}
        onChange={async () => onChange(await onBlockNoteChange())}
        sideMenu={false}
        formattingToolbar={false}
        className={cn('p-2 border rounded-lg', className)}
      >
        <CustomSlashMenu />
        <CustomFormattingToolbar />
      </BlockNoteView>
    </Suspense>
  );
};

export default BlockNote;
