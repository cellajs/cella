import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** 0.4s after a 0.1s hold; `ease` tracks a critically damped spring of that length. */
const glideTiming: KeyframeAnimationOptions = { duration: 400, delay: 100, easing: 'ease', fill: 'backwards' };

type Geometry = { x: number; width: number };

const measure = (tab: HTMLElement): Geometry => ({ x: tab.offsetLeft, width: tab.offsetWidth });

/** The bar's geometry as painted, mid-glide included. */
function paintedGeometry(bar: HTMLElement): Geometry {
  const { a, e } = new DOMMatrixReadOnly(getComputedStyle(bar).transform);
  return { x: e, width: a * bar.offsetWidth };
}

/**
 * One underline bar per tab track, placed from the active tab's offsets and moved with `transform` only:
 * the glide then runs on the compositor and keeps presenting while the tab switch mounts the next page.
 * A switch sets the bar's width once and animates from the painted geometry through `scaleX`.
 */
function createTabIndicator() {
  let bar: HTMLElement | null = null;
  // Tabs that mounted an ActiveTabMarker, in mount order; the last one carries the bar
  let shown: HTMLElement[] = [];
  let placed: Geometry | null = null;
  let glide: Animation | null = null;
  let observer: ResizeObserver | null = null;
  let observedTab: HTMLElement | null = null;

  const place = (animate: boolean) => {
    if (!bar) return;
    const tab = shown.at(-1);
    bar.style.opacity = tab ? '1' : '0';
    if (!tab) return;

    if (tab !== observedTab) {
      if (observedTab) observer?.unobserve(observedTab);
      observer?.observe(tab);
      observedTab = tab;
    }

    const next = measure(tab);
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
    const tab = shown.at(-1);
    if (!tab || !placed) return;
    const next = measure(tab);
    if (next.x !== placed.x || next.width !== placed.width) place(false);
  };

  return {
    setBar: (el: HTMLElement | null) => {
      observer?.disconnect();
      observer = null;
      observedTab = null;
      bar = el;
      if (!el) return;
      observer = new ResizeObserver(onResize);
      if (el.parentElement) observer.observe(el.parentElement);
      place(false);
    },
    show: (tab: HTMLElement) => {
      shown = [...shown.filter((item) => item !== tab), tab];
      place(true);
    },
    // A switch hides the old tab before showing the new one in the same commit, so the bar glides on
    hide: (tab: HTMLElement) => {
      const carried = shown.at(-1) === tab;
      shown = shown.filter((item) => item !== tab);
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

/** The bar, rendered once in the tab track; the track is its containing block and the tabs' offsetParent. */
export function TabIndicatorBar({ indicator }: { indicator: TabIndicator }) {
  return (
    <span ref={indicator.setBar} aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-1 origin-left opacity-0">
      <span className="absolute inset-x-2 inset-y-0 rounded-sm bg-primary" />
    </span>
  );
}

/** Rendered inside the active tab: moves the bar onto that tab and scrolls it into view. */
export function ActiveTabMarker({ indicator }: { indicator: TabIndicator }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const tab = ref.current?.parentElement;
    if (!tab) return;
    indicator.show(tab);
    return () => indicator.hide(tab);
  }, [indicator]);

  useEffect(() => {
    ref.current?.parentElement?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, []);

  return <span ref={ref} hidden />;
}
