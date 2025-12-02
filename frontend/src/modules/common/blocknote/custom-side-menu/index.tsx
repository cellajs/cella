import { SideMenuExtension } from '@blocknote/core/extensions';
import { DragHandleButton, SideMenu, SideMenuController, useComponentsContext, useExtension, useExtensionState } from '@blocknote/react';
import { GripVerticalIcon } from 'lucide-react';
import { customBlockTypeSwitchItems } from '~/modules/common/blocknote/blocknote-config';
import { ResetBlockTypeItem } from '~/modules/common/blocknote/custom-side-menu/reset-block-type';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';

// in this menu we have only drag button
export const CustomSideMenu = ({ editor, allowedTypes, headingLevels }: CustomBlockNoteMenuProps) => {
  // biome-ignore lint/style/noNonNullAssertion: req by author
  const Components = useComponentsContext()!;
  const sideMenu = useExtension(SideMenuExtension, { editor });
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });

  return (
    <SideMenuController
      sideMenu={(props) => (
        <SideMenu {...props}>
          {customBlockTypeSwitchItems.includes(block?.type) ? (
            <DragHandleButton {...props}>
              <ResetBlockTypeItem editor={editor} props={props} allowedTypes={allowedTypes} headingLevels={headingLevels} />
            </DragHandleButton>
          ) : (
            <Components.SideMenu.Button
              onDragStart={(e) => {
                if (!block) return;
                sideMenu.blockDragStart(e, block);
              }}
              onDragEnd={sideMenu.blockDragEnd}
              className="bn-button"
              icon={<GripVerticalIcon size={22} data-test="dragHandle" />}
              label="Open side menu"
              draggable={!!block}
              onClick={(e) => e.preventDefault()}
            />
          )}
        </SideMenu>
      )}
    />
  );
};
