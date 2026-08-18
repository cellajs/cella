import { SideMenuExtension } from '@blocknote/core/extensions';
import { SideMenu, SideMenuController, useExtension, useExtensionState } from '@blocknote/react';
import { GripVerticalIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { customBlockTypeSwitchItems } from '~/modules/common/blocknote/blocknote-config';
import { ResetBlockTypeItem } from '~/modules/common/blocknote/custom-side-menu/reset-block-type';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

export function CustomSideMenu({ editor, allowedTypes, headingLevels, titleLevel }: CustomBlockNoteMenuProps) {
  return (
    <SideMenuController
      sideMenu={(props) => {
        const sideMenu = useExtension(SideMenuExtension);
        const block = useExtensionState(SideMenuExtension, {
          editor,
          selector: (state) => state?.block,
        });
        if (block === undefined) return null;
        // Forced-title mode: the title block gets no drag handle or type menu (TypeCellOS/BlockNote#709).
        if (titleLevel !== undefined && block.id === editor.document[0]?.id) return null;
        return (
          <SideMenu {...props}>
            <DragHandle
              sideMenu={sideMenu}
              block={block}
              hasMenu={customBlockTypeSwitchItems.includes(block.type)}
              editor={editor}
              allowedTypes={allowedTypes}
              headingLevels={headingLevels}
              titleLevel={titleLevel}
            />
          </SideMenu>
        );
      }}
    />
  );
}

// Controlled click-only state keeps a drag mousedown from opening Base UI's menu.
function DragHandle({
  sideMenu,
  block,
  hasMenu,
  editor,
  allowedTypes,
  headingLevels,
  titleLevel,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: BlockNote extension instance type is not exported
  sideMenu: any;
  // biome-ignore lint/suspicious/noExplicitAny: Block type depends on editor schema
  block: any;
  hasMenu: boolean;
  editor: CustomBlockNoteMenuProps['editor'];
  allowedTypes: CustomBlockNoteMenuProps['allowedTypes'];
  headingLevels: CustomBlockNoteMenuProps['headingLevels'];
  titleLevel: CustomBlockNoteMenuProps['titleLevel'];
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
      className="bn-button cursor-grab text-gray-400"
      aria-label="Drag handle"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
    >
      <GripVerticalIcon className="size-5.5" data-test="dragHandle" />
    </button>
  );

  if (!hasMenu) return gripButton;

  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open, details) => {
        // onClick handles every open and close, so only external dismiss events (escape, outside press) apply here.
        if (details.reason === 'trigger-press') return;
        setMenuOpen(open);
        if (!open) sideMenu.unfreezeMenu();
      }}
    >
      <DropdownMenuTrigger render={gripButton} />
      <DropdownMenuContent
        container={editor.portalElement}
        side="left"
        className="bn-menu-dropdown bn-drag-handle-menu"
      >
        <ResetBlockTypeItem
          editor={editor}
          allowedTypes={allowedTypes}
          headingLevels={headingLevels}
          titleLevel={titleLevel}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
