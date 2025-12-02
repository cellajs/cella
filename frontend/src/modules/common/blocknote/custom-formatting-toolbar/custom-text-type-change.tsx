import { BasicTextStyleButton, useBlockNoteEditor, useEditorState } from '@blocknote/react';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';

// Infer BasicTextStyle type directly from component prop
type BasicTextStyle = React.ComponentProps<typeof BasicTextStyleButton>['basicTextStyle'];

export const CustomTextStyleSelect = () => {
  const editor = useBlockNoteEditor(customSchema);

  // Update the block on content or selection change
  useEditorState({
    editor,
    selector: ({ editor }) => editor.getTextCursorPosition().block,
  });


  const styles = ['bold', 'strike', 'italic', 'underline', 'code'] satisfies BasicTextStyle[];

  return (
    <>
      {styles.map((el) => (
        <BasicTextStyleButton key={`${el}StyleButton`} basicTextStyle={el} />
      ))}
    </>
  );
};
