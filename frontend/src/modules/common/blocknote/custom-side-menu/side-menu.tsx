import { SideMenuExtension } from '@blocknote/core/extensions';
import { SideMenu, SideMenuController, useExtension, useExtensionState, usePortalElement } from '@blocknote/react';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlockTypeItems } from '~/modules/common/blocknote/custom-side-menu/block-type-items';
import { useBlockNoteComponents } from '~/modules/common/blocknote/hooks/use-blocknote-components';
import type { CustomBlock, CustomBlockNoteEditor, CustomBlockNoteMenuProps } from '~/modules/common/blocknote/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

interface CustomSideMenuProps extends CustomBlockNoteMenuProps {
  pinTitleBlock?: boolean;
}

export function CustomSideMenu({ editor, allowedTypes, headingLevels, pinTitleBlock }: CustomSideMenuProps) {
  return (
    <SideMenuController
      sideMenu={() => <BlockSideMenu editor={editor} allowedTypes={allowedTypes} headingLevels={headingLevels} pinTitleBlock={pinTitleBlock} />}
    />
  );
}

function BlockSideMenu({ editor, allowedTypes, headingLevels, pinTitleBlock }: CustomSideMenuProps) {
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });
  if (block === undefined) return null;
  // A pinned title is not moved, so it gets no handle (TypeCellOS/BlockNote#709).
  if (pinTitleBlock && block.id === editor.document[0]?.id) return null;
  return (
    <SideMenu>
      <DragHandle block={block} editor={editor} allowedTypes={allowedTypes} headingLevels={headingLevels} pinTitleBlock={pinTitleBlock} />
    </SideMenu>
  );
}

interface DragHandleProps extends CustomSideMenuProps {
  block: CustomBlock;
}

// Controlled click-only state keeps a drag mousedown from opening Base UI's menu.
function DragHandle({ block, editor, allowedTypes, headingLevels, pinTitleBlock }: DragHandleProps) {
  const { t } = useTranslation();
  const portalElement = usePortalElement();
  const sideMenu = useExtension(SideMenuExtension);
  const [menuOpen, setMenuOpen] = useState(false);
  const isDraggingRef = useRef(false);

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    isDraggingRef.current = true;
    setMenuOpen(false);
    sideMenu.blockDragStart(event, block);
  };

  const handleDragEnd = () => {
    sideMenu.blockDragEnd();
    // Delay reset so a residual click after drag doesn't reopen the menu
    requestAnimationFrame(() => {
      isDraggingRef.current = false;
    });
  };

  const handleClick = () => {
    if (isDraggingRef.current) return;
    const open = !menuOpen;
    if (open) sideMenu.freezeMenu();
    else sideMenu.unfreezeMenu();
    setMenuOpen(open);
  };

  const gripButton = (
    <button
      type="button"
      draggable
      className="bn-button cursor-grab text-faint-foreground"
      aria-label={t('c:reorder')}
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
          canMoveUp={!(pinTitleBlock && block.id === editor.document[1]?.id)}
          onMoved={() => {
            setMenuOpen(false);
            sideMenu.unfreezeMenu();
          }}
        />
        <BlockTypeItems editor={editor} block={block} allowedTypes={allowedTypes} headingLevels={headingLevels} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface MoveBlockItemsProps {
  editor: CustomBlockNoteEditor;
  block: CustomBlock;
  canMoveUp: boolean;
  onMoved: () => void;
}

/** Moves the block one place, for a pointer that cannot drag; the keyboard has the editor's own shortcut. */
function MoveBlockItems({ editor, block, canMoveUp, onMoved }: MoveBlockItemsProps) {
  const { t } = useTranslation();
  const Components = useBlockNoteComponents();
  if (!editor.isEditable) return null;

  return (
    <>
      {canMoveUp && (
        <Components.Generic.Menu.Item
          className="bn-menu-item"
          icon={<ArrowUpIcon className="size-4" />}
          onClick={() => {
            editor.moveBlocksUp(block);
            onMoved();
          }}
        >
          {t('c:move_up')}
        </Components.Generic.Menu.Item>
      )}
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        icon={<ArrowDownIcon className="size-4" />}
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
