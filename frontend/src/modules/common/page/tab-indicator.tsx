import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** `ease` tracks a critically damped spring of that length. No hold ahead of it: on the compositor the glide need not wait out the page mount. */
const glideTiming: KeyframeAnimationOptions = { duration: 400, easing: 'ease' };

type Geometry = { x: number; width: number };

/** The line's place in the track: the marker's box, offset by the tab that holds it. */
const measure = (marker: HTMLElement): Geometry => ({ x: (marker.parentElement?.offsetLeft ?? 0) + marker.offsetLeft, width: marker.offsetWidth });

/** The bar's geometry as painted, mid-glide included. */
function paintedGeometry(bar: HTMLElement): Geometry {
  const { a, e } = new DOMMatrixReadOnly(getComputedStyle(bar).transform);
  return { x: e, width: a * bar.offsetWidth };
}

/**
 * One underline bar per tab track, placed on the active tab's marker and moved with `transform` only:
 * the glide then runs on the compositor and keeps presenting while the tab switch mounts the next page.
 * A switch sets the bar's width once and animates from the painted geometry through `scaleX`.
 */
function createTabIndicator() {
  let bar: HTMLElement | null = null;
  // Markers of the tabs that mounted an ActiveTabMarker, in mount order; the last one carries the bar
  let shown: HTMLElement[] = [];
  let placed: Geometry | null = null;
  let glide: Animation | null = null;
  let observer: ResizeObserver | null = null;
  let observedMarker: HTMLElement | null = null;
  let revealed = false;

  const place = (animate: boolean) => {
    if (!bar) return;
    const marker = shown.at(-1);
    bar.style.opacity = marker ? '1' : '0';
    if (!marker) return;

    if (marker !== observedMarker) {
      if (observedMarker) observer?.unobserve(observedMarker);
      observer?.observe(marker);
      observedMarker = marker;
    }

    const next = measure(marker);
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
  const handleResize = () => {
    const marker = shown.at(-1);
    if (!marker || !placed) return;
    const next = measure(marker);
    if (next.x !== placed.x || next.width !== placed.width) place(false);
  };

  return {
    setBar: (el: HTMLElement | null) => {
      observer?.disconnect();
      observer = null;
      observedMarker = null;
      bar = el;
      if (!el) return;
      observer = new ResizeObserver(handleResize);
      if (el.parentElement) observer.observe(el.parentElement);
      place(false);
    },
    show: (marker: HTMLElement) => {
      shown = [...shown.filter((item) => item !== marker), marker];
      place(true);
    },
    // A switch hides the old marker before showing the new one in the same commit, so the bar glides on
    hide: (marker: HTMLElement) => {
      const carried = shown.at(-1) === marker;
      shown = shown.filter((item) => item !== marker);
      if (carried) place(true);
    },
    // A bar's first tab is scrolled to at once: a bar that replaces another (a skeleton's) would replay the glide from the track's start
    reveal: (tab: HTMLElement) => {
      tab.scrollIntoView({ behavior: revealed ? 'smooth' : 'instant', inline: 'center', block: 'nearest' });
      revealed = true;
    },
  };
}

export type TabIndicator = ReturnType<typeof createTabIndicator>;

/** Stable indicator for one tab bar: TabNavShell renders its bar, ActiveTabMarker moves it. */
export function useTabIndicator(): TabIndicator {
  const [indicator] = useState(createTabIndicator);
  return indicator;
}

interface TabIndicatorProps {
  indicator: TabIndicator;
}

/**
 * The bar, rendered once in the tab track; the track is its containing block and the tabs' offsetParent. It is the
 * line itself, with no inset of its own: a `scaleX` glide would scale an inset along and paint the wrong width.
 */
export function TabIndicatorBar({ indicator }: TabIndicatorProps) {
  return (
    <span
      ref={indicator.setBar}
      aria-hidden
      className="pointer-events-none absolute bottom-0 left-0 h-1 origin-left rounded-sm bg-primary opacity-0"
    />
  );
}

/** Rendered inside the active tab: the bar takes this marker's box, and the tab scrolls into view. */
export function ActiveTabMarker({ indicator }: TabIndicatorProps) {
  const markerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    indicator.show(marker);
    return () => indicator.hide(marker);
  }, [indicator]);

  useEffect(() => {
    const tab = markerRef.current?.parentElement;
    if (tab) indicator.reveal(tab);
  }, [indicator]);

  return <span ref={markerRef} className="absolute inset-x-2 bottom-0" />;
}
