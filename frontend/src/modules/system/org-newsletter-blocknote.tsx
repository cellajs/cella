import { DragHandleButton, SideMenu, SideMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import DOMPurify from 'dompurify';
import { Suspense } from 'react';
import { useThemeStore } from '~/store/theme';

import '~/modules/common/blocknote/styles.css';

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
        className="pl-6 border rounded-lg"
      >
        <SideMenuController
          sideMenu={(props) => (
            <SideMenu {...props}>
              <DragHandleButton {...props} />
            </SideMenu>
          )}
        />
      </BlockNoteView>
    </Suspense>
  );
};

export default BlockNote;