import { SideMenuExtension } from '@blocknote/core/extensions';
import { SideMenu, SideMenuController, useComponentsContext, useExtension, useExtensionState, usePortalElement } from '@blocknote/react';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ResetBlockTypeItem } from '~/modules/common/blocknote/custom-side-menu/reset-block-type';
import type { CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

export function CustomSideMenu({ editor, allowedTypes, headingLevels }: CustomBlockNoteMenuProps) {
  return (
    <SideMenuController
      sideMenu={(props) => {
        const sideMenu = useExtension(SideMenuExtension);
        const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });
        if (block === undefined) return null;
        return (
          <SideMenu {...props}>
            <DragHandle sideMenu={sideMenu} block={block} editor={editor} allowedTypes={allowedTypes} headingLevels={headingLevels} />
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
  editor,
  allowedTypes,
  headingLevels,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: BlockNote extension instance type is not exported
  sideMenu: any;
  // biome-ignore lint/suspicious/noExplicitAny: Block type depends on editor schema
  block: any;
  editor: CustomBlockNoteMenuProps['editor'];
  allowedTypes: CustomBlockNoteMenuProps['allowedTypes'];
  headingLevels: CustomBlockNoteMenuProps['headingLevels'];
}) {
  const portalElement = usePortalElement();
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
    if (isDragging.current) return;
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
      className="bn-button cursor-grab text-muted-foreground/70"
      aria-label="Drag handle"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
    >
      <GripVerticalIcon className="size-5.5" data-test="dragHandle" />
    </button>
  );

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
      <DropdownMenuContent container={portalElement} side="left" className="bn-menu-dropdown bn-drag-handle-menu">
        <MoveBlockItems
          editor={editor}
          block={block}
          onMoved={() => {
            setMenuOpen(false);
            sideMenu.unfreezeMenu();
          }}
        />
        <ResetBlockTypeItem editor={editor} allowedTypes={allowedTypes} headingLevels={headingLevels} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Moves the block one place, for a pointer that cannot drag; the keyboard has the editor's own shortcut. */
function MoveBlockItems({
  editor,
  block,
  onMoved,
}: {
  editor: CustomBlockNoteMenuProps['editor'];
  // biome-ignore lint/suspicious/noExplicitAny: Block type depends on editor schema
  block: any;
  onMoved: () => void;
}) {
  const { t } = useTranslation();
  const Components = useComponentsContext()!;
  if (!editor.isEditable) return null;

  return (
    <>
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        icon={<ArrowUpIcon />}
        onClick={() => {
          editor.moveBlocksUp(block);
          onMoved();
        }}
      >
        {t('c:move_up')}
      </Components.Generic.Menu.Item>
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        icon={<ArrowDownIcon />}
        onClick={() => {
          editor.moveBlocksDown(block);
          onMoved();
        }}
      >
        {t('c:move_down')}
      </Components.Generic.Menu.Item>
    </>
  );
}
