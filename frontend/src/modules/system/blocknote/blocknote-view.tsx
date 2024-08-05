import { useCreateBlockNote, DragHandleButton, SideMenu, SideMenuController } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import { useState, Suspense } from 'react';

import './styles.css';

const BlockNote = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const editor = useCreateBlockNote();
  const [markdownAsHTML, setMarkdownAsHTML] = useState<string>(value);

  const onBlockNoteChange = async () => {
    // Converts the editor's contents from Block objects to HTML and store to state.

    // TODO FIX HTML sending content and remove last row
    const html = await editor.blocksToHTMLLossy(editor.document);
    setMarkdownAsHTML(html);
    return html;
  };

  return (
    <Suspense>
      <BlockNoteView
        editor={editor}
        defaultValue={markdownAsHTML}
        onChange={async () => {
          const html = await onBlockNoteChange();
          onChange(html);
        }}
        sideMenu={false}
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
