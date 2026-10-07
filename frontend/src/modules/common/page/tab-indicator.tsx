import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** `ease` tracks a critically damped spring of that length. No hold ahead of it: on the compositor the glide need not wait out the page mount. */
const glideTiming: KeyframeAnimationOptions = { duration: 400, easing: 'ease' };

type Geometry = { x: number; width: number };

/** The line's place in the track: the slot's box, offset by the tab that holds it. */
const measure = (slot: HTMLElement): Geometry => ({ x: (slot.parentElement?.offsetLeft ?? 0) + slot.offsetLeft, width: slot.offsetWidth });

/** The bar's geometry as painted, mid-glide included. */
function paintedGeometry(bar: HTMLElement): Geometry {
  const { a, e } = new DOMMatrixReadOnly(getComputedStyle(bar).transform);
  return { x: e, width: a * bar.offsetWidth };
}

/**
 * One underline bar per tab track, placed on the active tab's line slot and moved with `transform` only:
 * the glide then runs on the compositor and keeps presenting while the tab switch mounts the next page.
 * A switch sets the bar's width once and animates from the painted geometry through `scaleX`.
 */
function createTabIndicator() {
  let bar: HTMLElement | null = null;
  // Line slots of the tabs that mounted an ActiveTabMarker, in mount order; the last one carries the bar
  let shown: HTMLElement[] = [];
  let placed: Geometry | null = null;
  let glide: Animation | null = null;
  let observer: ResizeObserver | null = null;
  let observedSlot: HTMLElement | null = null;

  const place = (animate: boolean) => {
    if (!bar) return;
    const slot = shown.at(-1);
    bar.style.opacity = slot ? '1' : '0';
    if (!slot) return;

    if (slot !== observedSlot) {
      if (observedSlot) observer?.unobserve(observedSlot);
      observer?.observe(slot);
      observedSlot = slot;
    }

    const next = measure(slot);
    const from = animate && placed && typeof bar.animate === 'function' ? paintedGeometry(bar) : null;
    glide?.cancel();
    glide = null;
    bar.style.width = `${next.width}px`;
    bar.style.transform = `translateX(${next.x}px)`;
    placed = next;

    if (!from || next.width <= 0 || (from.x === next.x && from.width === next.width)) return;
    const start = `translateX(${from.x}px) scaleX(${from.width / next.width})`;
    glide = bar.animate([{ transform: start }, { transform: bar.style.transform }], glideTiming);
  };

  // Viewport, font and label changes shift the offsets: follow them without a glide
  const onResize = () => {
    const slot = shown.at(-1);
    if (!slot || !placed) return;
    const next = measure(slot);
    if (next.x !== placed.x || next.width !== placed.width) place(false);
  };

  return {
    setBar: (el: HTMLElement | null) => {
      observer?.disconnect();
      observer = null;
      observedSlot = null;
      bar = el;
      if (!el) return;
      observer = new ResizeObserver(onResize);
      if (el.parentElement) observer.observe(el.parentElement);
      place(false);
    },
    show: (slot: HTMLElement) => {
      shown = [...shown.filter((item) => item !== slot), slot];
      place(true);
    },
    // A switch hides the old slot before showing the new one in the same commit, so the bar glides on
    hide: (slot: HTMLElement) => {
      const carried = shown.at(-1) === slot;
      shown = shown.filter((item) => item !== slot);
      if (carried) place(true);
    },
  };
}

export type TabIndicator = ReturnType<typeof createTabIndicator>;

/** Stable indicator for one tab bar: TabNavShell renders its bar, ActiveTabMarker moves it. */
export function useTabIndicator(): TabIndicator {
  const [indicator] = useState(createTabIndicator);
  return indicator;
}

/**
 * The bar, rendered once in the tab track; the track is its containing block and the tabs' offsetParent. It is the
 * line itself, with no inset of its own: a `scaleX` glide would scale an inset along and paint the wrong width.
 */
export function TabIndicatorBar({ indicator }: { indicator: TabIndicator }) {
  return (
    <span
      ref={indicator.setBar}
      aria-hidden
      className="pointer-events-none absolute bottom-0 left-0 h-1 origin-left rounded-sm bg-primary opacity-0"
    />
  );
}

/** Rendered inside the active tab as the line's slot: the bar takes its box, and the tab scrolls into view. */
export function ActiveTabMarker({ indicator }: { indicator: TabIndicator }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const slot = ref.current;
    if (!slot) return;
    indicator.show(slot);
    return () => indicator.hide(slot);
  }, [indicator]);

  useEffect(() => {
    ref.current?.parentElement?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, []);

  return <span ref={ref} className="pointer-events-none absolute inset-x-2 bottom-0" />;
}
