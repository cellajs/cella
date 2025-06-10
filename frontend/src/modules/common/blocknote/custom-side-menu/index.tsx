import { DragHandleMenu, SideMenu, SideMenuController } from '@blocknote/react';
import { CustomDragHandleButton } from '~/modules/common/blocknote/custom-side-menu/drag-handle-button';
import { ResetBlockTypeItem } from '~/modules/common/blocknote/custom-side-menu/reset-block-type';

import { sideMenuOpenOnTypes } from '~/modules/common/blocknote/blocknote-config';
import type { CustomBlockNoteEditor, CustomBlockTypes } from '~/modules/common/blocknote/types';

// in this menu we have only drag button
export const CustomSideMenu = ({ editor, allowedTypes }: { editor: CustomBlockNoteEditor; allowedTypes: CustomBlockTypes[] }) => (
  <SideMenuController
    sideMenu={(props) => (
      <SideMenu {...props}>
        <CustomDragHandleButton
          hasDropdown={sideMenuOpenOnTypes.includes(props.block.type)}
          dragHandleMenu={(props) => (
            <>
              {sideMenuOpenOnTypes.includes(props.block.type) ? (
                <DragHandleMenu {...props}>
                  <ResetBlockTypeItem editor={editor} props={props} allowedTypes={allowedTypes} />
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
