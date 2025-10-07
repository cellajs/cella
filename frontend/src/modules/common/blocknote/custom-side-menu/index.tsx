import { DragHandleMenu, SideMenu, SideMenuController } from '@blocknote/react';
import { customBlockTypeSwitchItems } from '~/modules/common/blocknote/blocknote-config';
import { CustomDragHandleButton } from '~/modules/common/blocknote/custom-side-menu/drag-handle-button';
import { ResetBlockTypeItem } from '~/modules/common/blocknote/custom-side-menu/reset-block-type';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';

// in this menu we have only drag button
export const CustomSideMenu = ({ editor, allowedTypes, headingLevels }: CustomBlockNoteMenuProps) => (
  <SideMenuController
    sideMenu={(props) => (
      <SideMenu {...props}>
        <CustomDragHandleButton
          hasDropdown={customBlockTypeSwitchItems.includes(props.block.type)}
          dragHandleMenu={(props) => (
            <>
              {customBlockTypeSwitchItems.includes(props.block.type) ? (
                <DragHandleMenu {...props}>
                  <ResetBlockTypeItem editor={editor} props={props} allowedTypes={allowedTypes} headingLevels={headingLevels} />
                </DragHandleMenu>
              ) : null}
            </>
          )}
          {...props}
        />
      </SideMenu>
    )}
  />
);
