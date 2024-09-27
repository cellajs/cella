import { DragHandleButton, SideMenu, SideMenuController } from '@blocknote/react';

// in this menu we have only drag button
export const CustomSideMenu = () => (
  <SideMenuController
    sideMenu={(props) => (
      <SideMenu {...props}>
        <DragHandleButton dragHandleMenu={() => null} {...props} />
      </SideMenu>
    )}
  />
);
