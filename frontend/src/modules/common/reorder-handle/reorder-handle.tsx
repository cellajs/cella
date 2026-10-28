import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon } from 'lucide-react';
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useMoreContrast } from '~/hooks/use-more-contrast';
import { announce, prepareAnnouncement } from '~/modules/common/announce';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

type Step = -1 | 1;

/** A place among siblings, 0-based. */
export interface ReorderPosition {
  index: number;
  total: number;
}

// The item whose handle takes focus back when a move re-renders its row: React re-inserts a row it moves down, and a
// node taken out of the document drops focus. Focus going to another element, a pointer press or an unmount ends it.
let followedId: string | null = null;
let isListening = false;

const stopFollowing = (id: string | null) => {
  if (id === null || followedId === id) followedId = null;
};

/** Keeps focus with the handle of `id` through the render that moving it causes, as after a pointer drop. */
export function followReorderFocus(id: string) {
  followedId = id;
  if (isListening) return;
  isListening = true;
  document.addEventListener('pointerdown', () => stopFollowing(null), { capture: true });
}

const stepKeys: Record<'vertical' | 'horizontal', Partial<Record<string, Step>>> = {
  vertical: { ArrowUp: -1, ArrowDown: 1 },
  horizontal: { ArrowLeft: -1, ArrowRight: 1 },
};
const shiftKeys: Partial<Record<string, Step>> = { ArrowLeft: -1, ArrowRight: 1 };

interface ReorderHandleProps {
  /** Identifies the item across renders, so focus follows it to its new place. */
  id: string;
  /** Announced with its place: "Name, 2 of 5". */
  name: string;
  /** 0-based place among the items the arrow keys step through. */
  index: number;
  total: number;
  /** `horizontal` steps with ←/→, as board panels do. */
  orientation?: 'vertical' | 'horizontal';
  onMove: (step: Step) => void;
  /** ←/→ of a tree item: outdent (-1) or indent (1); returns the new place, or null when the item cannot go there. */
  onShift?: (direction: Step) => ReorderPosition | null;
  /** A click while the move menu is off, such as a board panel's collapse. */
  onClick?: () => void;
  /** Items ahead of the moves in the menu, such as that collapse. */
  menuItems?: ReactNode;
  /** A grid cell's tab index, so the grid keeps one tab stop. */
  tabIndex?: number;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

/**
 * The grip that reorders an item, the same in every list, table and board:
 * - a pointer drags it (the caller registers the drag), and a click focuses it, also in Safari;
 * - while it has focus it is the only receiver of the arrow keys that move it, one place per press, and focus stays
 *   with the item through the render; a polite live region announces the new place;
 * - Tab moves on, and inside a grid Escape hands focus back to the cell, so the arrows navigate the grid again;
 * - with increased contrast a click opens a menu of single moves, the path for a pointer that cannot drag (WCAG 2.5.7).
 */
export function ReorderHandle({
  id,
  name,
  index,
  total,
  orientation = 'vertical',
  onMove,
  onShift,
  onClick,
  menuItems,
  tabIndex,
  className,
  ref,
  children,
}: ReorderHandleProps) {
  const { t } = useTranslation();
  const moreContrast = useMoreContrast();
  const descriptionId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  // A press that turns into a drag must leave the menu shut, so a mouse opens it on the click and a drag eats that click
  const isDraggingRef = useRef(false);

  const gripRef = useRef<HTMLButtonElement | null>(null);
  const setGrip = useCallback(
    (element: HTMLButtonElement | null) => {
      gripRef.current = element;
      if (typeof ref === 'function') ref(element);
      else if (ref) ref.current = element;
    },
    [ref],
  );

  const placedAtRef = useRef(index);
  useLayoutEffect(() => {
    const hasMoved = placedAtRef.current !== index;
    placedAtRef.current = index;
    const grip = gripRef.current;
    if (followedId !== id || !grip) return;
    // Only focus the move dropped comes back; focus the user put elsewhere stays there
    if (!document.activeElement || document.activeElement === document.body) grip.focus({ preventScroll: true });
    if (hasMoved) grip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  useLayoutEffect(() => () => stopFollowing(id), [id]);

  const announcePlace = (place: ReorderPosition) => {
    if (gripRef.current) announce(gripRef.current, t('c:success.move_position', { name, position: place.index + 1, total: place.total }));
  };

  const move = (step: Step) => {
    const target = index + step;
    if (target < 0 || target >= total) return;
    followReorderFocus(id);
    onMove(step);
    announcePlace({ index: target, total });
  };

  const shift = (direction: Step) => {
    if (!onShift) return;
    followReorderFocus(id);
    const place = onShift(direction);
    if (place) announcePlace(place);
  };

  const returnToCell = (event: KeyboardEvent<HTMLButtonElement>) => {
    const grip = event.currentTarget;
    const cell = grip.closest<HTMLElement>('[role="gridcell"][aria-selected="true"]');
    if (!cell) return;
    event.preventDefault();
    event.stopPropagation();
    // A cell that takes focus passes it on to a tab stop inside it, so the grip leaves the tab order for that moment
    const ownTabIndex = grip.tabIndex;
    grip.tabIndex = -1;
    cell.focus();
    grip.tabIndex = ownTabIndex;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement> & { preventBaseUIHandler?: () => void }) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Escape') return returnToCell(event);
    const step = stepKeys[orientation][event.key];
    const direction = onShift ? shiftKeys[event.key] : undefined;
    if (!step && !direction) return;
    // No grid navigation, global hotkey or menu trigger gets these keys
    event.preventDefault();
    event.stopPropagation();
    event.preventBaseUIHandler?.();
    if (step) move(step);
    else if (direction) shift(direction);
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // Safari and Firefox on macOS leave a clicked button unfocused; a key press (detail 0) already has focus
    if (event.detail > 0) event.currentTarget.focus({ preventScroll: true });
    if (isDraggingRef.current) return;
    if (!moreContrast) return onClick?.();
    // A key press opens the menu through Base UI, which moves focus to the first item
    if (event.detail > 0) setMenuOpen((open) => !open);
  };

  const gripProps = {
    ref: setGrip,
    tabIndex,
    className,
    'aria-roledescription': t('c:sortable'),
    'aria-label': t('c:sortable_position', { name, position: index + 1, total }),
    'aria-describedby': descriptionId,
    onKeyDown: handleKeyDown,
    onClick: handleClick,
    onFocus: (event: FocusEvent<HTMLButtonElement>) => prepareAnnouncement(event.currentTarget),
    // A row re-inserted by a move blurs its handle with no next target; any other blur ends the follow
    onBlur: (event: FocusEvent<HTMLButtonElement>) => {
      if (event.relatedTarget) stopFollowing(id);
    },
    onDragStart: () => {
      isDraggingRef.current = true;
      setMenuOpen(false);
    },
    onDragEnd: () => {
      followReorderFocus(id);
      // A frame of delay keeps a click trailing the drop from opening the menu
      requestAnimationFrame(() => {
        isDraggingRef.current = false;
      });
    },
    children,
  };

  const description = (
    <span id={descriptionId} hidden>
      {t('c:sortable.text')}
    </span>
  );

  if (!moreContrast) {
    return (
      <>
        <button type="button" {...gripProps} />
        {description}
      </>
    );
  }

  const [BackIcon, ForwardIcon] = orientation === 'horizontal' ? [ChevronLeftIcon, ChevronRightIcon] : [ChevronUpIcon, ChevronDownIcon];
  const [backLabel, forwardLabel] =
    orientation === 'horizontal' ? (['c:move_left', 'c:move_right'] as const) : (['c:move_up', 'c:move_down'] as const);

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open, details) => {
          // A mouse press may turn into a drag, so there the click decides; a key press and every close apply at once
          if (details.reason === 'trigger-press' && details.event.type === 'mousedown') return;
          setMenuOpen(open);
        }}
        // A pointer close returns focus nowhere, and after a move from the menu it belongs on the grip
        onOpenChangeComplete={(open) => {
          if (!open && followedId === id) gripRef.current?.focus({ preventScroll: true });
        }}
      >
        <DropdownMenuTrigger render={<button type="button" />} {...gripProps} />
        <DropdownMenuContent align="start" className="min-w-40">
          {menuItems}
          <DropdownMenuItem disabled={index === 0} onClick={() => move(-1)}>
            <BackIcon />
            {t(backLabel)}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === total - 1} onClick={() => move(1)}>
            <ForwardIcon />
            {t(forwardLabel)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {description}
    </>
  );
}
