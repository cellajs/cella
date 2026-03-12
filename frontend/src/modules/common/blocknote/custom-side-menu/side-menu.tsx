import { SideMenuExtension } from '@blocknote/core/extensions';
import { SideMenu, SideMenuController, useExtension, useExtensionState } from '@blocknote/react';
import { GripVerticalIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { customBlockTypeSwitchItems } from '~/modules/common/blocknote/blocknote-config';
import { ResetBlockTypeItem } from '~/modules/common/blocknote/custom-side-menu/reset-block-type';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';
import { DropdownMenu, DropdownMenuContentNoPortal, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

// in this menu we have only drag button
export const CustomSideMenu = ({ editor, allowedTypes, headingLevels }: CustomBlockNoteMenuProps) => {
  return (
    <SideMenuController
      sideMenu={(props) => {
        const sideMenu = useExtension(SideMenuExtension);
        const block = useExtensionState(SideMenuExtension, {
          editor,
          selector: (state) => state?.block,
        });
        if (block === undefined) return null;
        return (
          <SideMenu {...props}>
            <DragHandle
              sideMenu={sideMenu}
              block={block}
              hasMenu={customBlockTypeSwitchItems.includes(block.type)}
              editor={editor}
              allowedTypes={allowedTypes}
              headingLevels={headingLevels}
            />
          </SideMenu>
        );
      }}
    />
  );
};

// Custom drag handle — separates drag from menu-open.
// Mismatch: Base UI's Menu.Trigger opens on mousedown, Radix on click.
// With Base UI, dragging fires mousedown which incorrectly opens the menu.
// We use controlled menu state toggled only by onClick to match Radix behavior.
function DragHandle({
  sideMenu,
  block,
  hasMenu,
  editor,
  allowedTypes,
  headingLevels,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: BlockNote extension instance type is not exported
  sideMenu: any;
  // biome-ignore lint/suspicious/noExplicitAny: Block type depends on editor schema
  block: any;
  hasMenu: boolean;
  editor: CustomBlockNoteMenuProps['editor'];
  allowedTypes: CustomBlockNoteMenuProps['allowedTypes'];
  headingLevels: CustomBlockNoteMenuProps['headingLevels'];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isDragging = useRef(false);

  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>) => {
    isDragging.current = true;
    setMenuOpen(false);
    sideMenu.blockDragStart(e, block);
  };

  const handleDragEnd = () => {
    sideMenu.blockDragEnd();
    // Delay reset so a residual click after drag doesn't reopen the menu
    requestAnimationFrame(() => {
      isDragging.current = false;
    });
  };

  const handleClick = () => {
    if (isDragging.current || !hasMenu) return;
    setMenuOpen((prev) => {
      const next = !prev;
      if (next) sideMenu.freezeMenu();
      else sideMenu.unfreezeMenu();
      return next;
    });
  };

  const gripButton = (
    <button
      type="button"
      draggable
      className="bn-button text-gray-400 cursor-grab"
      aria-label="Drag handle"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
    >
      <GripVerticalIcon size={22} data-test="dragHandle" />
    </button>
  );

  if (!hasMenu) return gripButton;

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open, details) => {
        // Ignore trigger-initiated events ('trigger-press') — our onClick
        // handles all opens and closes. Only respond to external dismiss
        // events like escape-key and outside-press.
        if (details.reason === 'trigger-press') return;
        setMenuOpen(open);
        if (!open) sideMenu.unfreezeMenu();
      }}
    >
      <DropdownMenuTrigger render={gripButton} />
      <DropdownMenuContentNoPortal side="left" className="bn-menu-dropdown bn-drag-handle-menu">
        <ResetBlockTypeItem editor={editor} allowedTypes={allowedTypes} headingLevels={headingLevels} />
      </DropdownMenuContentNoPortal>
    </DropdownMenu>
  );
}
