import { DragHandleButton, SideMenu, SideMenuController, useComponentsContext } from '@blocknote/react';
import { GripVertical } from 'lucide-react';
import { customBlockTypeSwitchItems } from '~/modules/common/blocknote/blocknote-config';
import { ResetBlockTypeItem } from '~/modules/common/blocknote/custom-side-menu/reset-block-type';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';

// in this menu we have only drag button
export const CustomSideMenu = ({ editor, allowedTypes, headingLevels }: CustomBlockNoteMenuProps) => {
  // biome-ignore lint/style/noNonNullAssertion: req by author
  const Components = useComponentsContext()!;

  return (
    <SideMenuController
      sideMenu={(props) => (
        <SideMenu {...props}>
          {customBlockTypeSwitchItems.includes(props.block.type) ? (
            <DragHandleButton {...props}>
              <ResetBlockTypeItem editor={editor} props={props} allowedTypes={allowedTypes} headingLevels={headingLevels} />
            </DragHandleButton>
          ) : (
            <Components.SideMenu.Button
              onDragStart={(e) => props.blockDragStart(e, props.block)}
              onDragEnd={props.blockDragEnd}
              className="bn-button"
              icon={<GripVertical size={22} data-test="dragHandle" />}
              label="Open side menu"
              draggable
              onClick={(e) => e.preventDefault()}
            />
          )}
        </SideMenu>
      )}
    />
  );
};
