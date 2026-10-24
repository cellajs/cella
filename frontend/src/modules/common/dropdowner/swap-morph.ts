import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';

/** Where a dropdown's box stays put while it resizes: the corner or edge that faces its trigger. */
export interface MorphAnchor {
  x: 'start' | 'center' | 'end' | 'stretch';
  y: 'top' | 'bottom';
}

interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
}

/** The swapped-out content as it was painted: the box size, where the content sat in it, and a copy of it. */
interface SwapSnapshot {
  width: number;
  height: number;
  inset: Inset;
  copy: HTMLElement;
}

const itemSelector = '[role="menuitem"], button';

function insetIn(container: HTMLElement, content: HTMLElement): Inset {
  const box = container.getBoundingClientRect();
  const rect = content.getBoundingClientRect();
  const borderRight = container.offsetWidth - container.clientWidth - container.clientLeft;
  const borderBottom = container.offsetHeight - container.clientHeight - container.clientTop;
  return {
    top: rect.top - box.top - container.clientTop,
    right: box.right - rect.right - borderRight,
    bottom: box.bottom - rect.bottom - borderBottom,
    left: rect.left - box.left - container.clientLeft,
    width: rect.width,
  };
}

function snapshot(container: HTMLElement, content: HTMLElement): SwapSnapshot {
  const copy = content.cloneNode(true) as HTMLElement;
  for (const element of [copy, ...copy.querySelectorAll('[id]')]) element.removeAttribute('id');
  return { width: container.offsetWidth, height: container.offsetHeight, inset: insetIn(container, content), copy };
}

const pinnedProperties = ['position', 'top', 'right', 'bottom', 'left', 'width', 'translate'];

/** Lays `element` out at its final place in the box, so the box can resize around it without reflowing it. */
function pin(element: HTMLElement, inset: Inset, anchor: MorphAnchor) {
  const { style } = element;
  style.position = 'absolute';
  style.width = `${inset.width}px`;
  if (anchor.y === 'top') style.top = `${inset.top}px`;
  else style.bottom = `${inset.bottom}px`;

  if (anchor.x === 'end') style.right = `${inset.right}px`;
  else if (anchor.x === 'start') style.left = `${inset.left}px`;
  else if (anchor.x === 'center') {
    style.left = '50%';
    style.translate = '-50% 0';
  } else {
    style.left = `${inset.left}px`;
    style.right = `${inset.right}px`;
    style.width = '';
  }
}

/**
 * A popup's positioner is placed by Floating UI a frame after its size changes, so while the popup grows its anchored
 * corner would trail. The positioner takes the end size at once and is offset by the growth until Floating UI places
 * it; the popup resizes inside it, pinned to the corner at the trigger.
 */
function holdPositioner(positioner: HTMLElement, popup: HTMLElement, from: SwapSnapshot, to: { width: number; height: number }, anchor: MorphAnchor) {
  const { style } = positioner;
  style.width = `${to.width}px`;
  style.height = `${to.height}px`;
  const dx = anchor.x === 'end' ? from.width - to.width : 0;
  const dy = anchor.y === 'bottom' ? from.height - to.height : 0;
  if (dx || dy) style.translate = `${dx}px ${dy}px`;

  const placed = new MutationObserver(() => {
    style.removeProperty('translate');
    placed.disconnect();
  });
  placed.observe(positioner, { attributes: true, attributeFilter: ['style'] });

  popup.style.position = 'absolute';
  popup.style[anchor.y] = '0';
  popup.style[anchor.x === 'end' ? 'right' : 'left'] = '0';

  return () => {
    placed.disconnect();
    for (const property of ['width', 'height', 'translate']) style.removeProperty(property);
    for (const property of ['top', 'right', 'bottom', 'left']) popup.style.removeProperty(property);
  };
}

/** Resizes the box from the old content's size to the new one's while a copy of the old fades out over the new. Returns a stop. */
function morph(container: HTMLElement, content: HTMLElement, from: SwapSnapshot, anchor: MorphAnchor, timing: MorphTiming, positioner?: HTMLElement) {
  const to = { width: container.offsetWidth, height: container.offsetHeight, inset: insetIn(container, content) };
  const { copy } = from;

  const releasePositioner = positioner && holdPositioner(positioner, container, from, to, anchor);
  if (!positioner) container.style.position = 'relative';
  container.style.overflow = 'hidden';
  pin(content, to.inset, anchor);
  pin(copy, from.inset, anchor);
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  copy.style.pointerEvents = 'none';
  container.append(copy);

  const { duration, easing } = timing;
  const animations = [
    container.animate(
      [
        { width: `${from.width}px`, height: `${from.height}px` },
        { width: `${to.width}px`, height: `${to.height}px` },
      ],
      { duration, easing },
    ),
    copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration * 0.4, fill: 'forwards' }),
    content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * 0.7, delay: duration * 0.25, fill: 'backwards' }),
  ];

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const animation of animations) animation.cancel();
    copy.remove();
    releasePositioner?.();
    container.style.removeProperty('position');
    container.style.removeProperty('overflow');
    for (const property of pinnedProperties) content.style.removeProperty(property);
  };
  animations[0].finished.then(stop, stop);
  return stop;
}

export interface MorphTiming {
  duration: number;
  easing: string;
}

interface SwapMorphOptions {
  dropdownKey: number;
  content: ReactNode;
  /** The box that resizes: the menu popup, or the drawer's content area. */
  containerRef: RefObject<HTMLElement | null>;
  /** The element that holds the dropdown's content inside the box. */
  contentRef: RefObject<HTMLElement | null>;
  /** Read at swap time, so a popup that flipped above its trigger grows upward. */
  anchor: () => MorphAnchor;
  timing: MorphTiming;
  /** The box is a popup that Floating UI places through this parent. */
  positioned?: boolean;
}

/**
 * When the open dropdown swaps its content (`push`, `back`), its box resizes from the old content to the new while the
 * two cross-fade, and focus moves into the new content: to its `[data-autofocus]` option after `push`, back to the item
 * that pushed after `back`.
 */
export function useSwapMorph({ dropdownKey, content, containerRef, contentRef, anchor, timing, positioned }: SwapMorphOptions) {
  const swapRef = useRef<{ from: SwapSnapshot | null; back: boolean } | null>(null);
  // Per push, the index of the item that had focus, so `back` can return to it
  const focusTrailRef = useRef<number[]>([]);

  // The store changes before React commits, so the listener still sees the content that is being swapped out
  useEffect(
    () =>
      dropdowner.subscribe((state, prev) => {
        const next = state.dropdown;
        const before = prev.dropdown;
        if (next?.key !== dropdownKey || before?.key !== dropdownKey || next.content === before.content) return;

        const container = containerRef.current;
        const current = contentRef.current;
        const back = next.history.length < before.history.length;
        if (next.history.length > before.history.length && current) {
          focusTrailRef.current.push([...current.querySelectorAll(itemSelector)].indexOf(document.activeElement as Element));
        }
        swapRef.current = { from: container && current ? snapshot(container, current) : null, back };
      }),
    [dropdownKey],
  );

  useLayoutEffect(() => {
    const swap = swapRef.current;
    swapRef.current = null;
    const container = containerRef.current;
    const current = contentRef.current;
    if (!swap || !container || !current) return;

    const target = swap.back
      ? current.querySelectorAll<HTMLElement>(itemSelector)[focusTrailRef.current.pop() ?? -1]
      : current.querySelector<HTMLElement>('[data-autofocus]');
    target?.focus({ preventScroll: true });

    if (!swap.from || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return morph(container, current, swap.from, anchor(), timing, (positioned && container.parentElement) || undefined);
  }, [content]);
}
