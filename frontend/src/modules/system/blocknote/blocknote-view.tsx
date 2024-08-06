import { useCreateBlockNote, DragHandleButton, SideMenu, SideMenuController } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import { Suspense } from 'react';

import './styles.css';

const BlockNote = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const editor = useCreateBlockNote();

  const onBlockNoteChange = async () => {
    // Converts the editor's contents from Block objects to HTML
    const html = await editor.blocksToHTMLLossy(editor.document);
    return html;
  };

  return (
    <Suspense>
      <BlockNoteView editor={editor} defaultValue={value} onChange={async () => onChange(await onBlockNoteChange())} sideMenu={false}>
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
