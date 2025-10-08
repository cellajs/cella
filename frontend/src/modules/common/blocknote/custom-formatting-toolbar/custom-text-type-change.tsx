import { BasicTextStyleButton, useBlockNoteEditor, useEditorContentOrSelectionChange } from '@blocknote/react';
import { useState } from 'react';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';

// Infer BasicTextStyle type directly from component prop
type BasicTextStyle = React.ComponentProps<typeof BasicTextStyleButton>['basicTextStyle'];

export const CustomTextStyleSelect = () => {
  const editor = useBlockNoteEditor(customSchema);
  const [_, setBlock] = useState(editor.getTextCursorPosition().block);
  // Update the block on content or selection change
  useEditorContentOrSelectionChange(() => setBlock(editor.getTextCursorPosition().block), editor);

  const styles = ['bold', 'strike', 'italic', 'underline', 'code'] satisfies BasicTextStyle[];

  return (
    <>
      {styles.map((el) => (
        <BasicTextStyleButton key={`${el}StyleButton`} basicTextStyle={el} />
      ))}
    </>
  );
};
