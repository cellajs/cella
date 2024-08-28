import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import DOMPurify from 'dompurify';
import { Suspense } from 'react';
import { useThemeStore } from '~/store/theme';

import '~/modules/common/blocknote/styles.css';
import { CustomSlashMenu } from '~/modules/common/blocknote/custom-slash-menu';
import { CustomFormattingToolbar } from '../common/blocknote/custom-formatting-toolbar';

const BlockNote = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
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
        className="p-2 border rounded-lg"
      >
        <CustomSlashMenu />
        <CustomFormattingToolbar />
      </BlockNoteView>
    </Suspense>
  );
};

export default BlockNote;
