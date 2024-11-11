import { DragHandleMenu, SideMenu, SideMenuController } from '@blocknote/react';
import { CustomDragHandleButton } from './drag-handle-button';
import { ResetBlockTypeItem } from './reset-block-type';

const typeOnSlashMenuAppearance = ['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem'];

// in this menu we have only drag button
export const CustomSideMenu = () => (
  <SideMenuController
    sideMenu={(props) => (
      <SideMenu {...props}>
        <CustomDragHandleButton
          haveDropDown={typeOnSlashMenuAppearance.includes(props.block.type)}
          dragHandleMenu={(props) => (
            <>
              {typeOnSlashMenuAppearance.includes(props.block.type) ? (
                <DragHandleMenu {...props}>
                  <ResetBlockTypeItem {...props} />
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
