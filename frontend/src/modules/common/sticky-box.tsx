import { type ComponentProps, type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';
import { isProgrammaticScroll } from '~/hooks/scroll-spy-store';
import { getScrollParent, scrollTopOf, viewportTopOf } from '~/utils/scroll-parent';

const passiveArg = { passive: true } as const;

interface StickyBoxProps extends Omit<ComponentProps<'div'>, 'ref'> {
  /** Offset (px) from the top of the scroll container at which the bar pins. */
  offsetTop?: number;
  /** Release the bar this many px before the bottom of its containing block (e.g. to clear a footer). */
  offsetBottom?: number;
  /** Disable sticky behaviour entirely (renders children in a plain div). */
  enabled?: boolean;
  /**
   * The bar scrolls away with the page on the way down, and slides in at the pin line when the reader scrolls up
   * while its own place is off screen. It is never hidden while that place is on screen.
   */
  hideWhenOutOfView?: boolean;
  /** CSS custom property the bar publishes its height to on the parent, e.g. `--sticky-stack-nav`. */
  publishVar?: string;
}

const stackNavVar = '--sticky-stack-nav';
const stackVars = [stackNavVar, '--sticky-stack-top'] as const;

/** Offset (px) the stack variables add to the bar's pin line, leaving out the one it publishes itself. */
export function stackOffset(bar: HTMLElement, publishVar?: string) {
  const barStyles = getComputedStyle(bar);
  return Math.max(
    ...stackVars.filter((stackVar) => stackVar !== publishVar).map((stackVar) => Number.parseFloat(barStyles.getPropertyValue(stackVar)) || 0),
  );
}

/** The same offset as a CSS length, so an element that pins with it follows the variables without a rerender. */
export function stackOffsetCss(publishVar?: string) {
  const consumedVars = stackVars.filter((stackVar) => stackVar !== publishVar).map((stackVar) => `var(${stackVar}, 0px)`);
  return consumedVars.length > 1 ? `max(${consumedVars.join(', ')})` : (consumedVars[0] ?? '0px');
}

/** Scrolls the scroll parent of `node` until `node` meets its top edge, the line `useStackedPin` pins at, when it sits below it. */
export function scrollToPinLine(node: HTMLElement) {
  const scrollParent = getScrollParent(node);
  const distance = node.getBoundingClientRect().top - viewportTopOf(scrollParent);
  if (distance > 0) scrollParent.scrollBy({ top: distance });
}

/**
 * Pins the element in `ref` at the top of its scroll parent while `enabled`, over the sticky stack (it covers the page
 * tabs), and publishes its height as `--sticky-stack-nav` on its parent, so bars further down that parent (a grid
 * header, section headers) pin below it. The parent also keeps one viewport of height and leaves scroll anchoring off:
 * a list that narrows under the pinned element can neither pull it down the page nor move the page.
 * @returns The inline style that pins the element, or undefined while disabled.
 */
export function useStackedPin(ref: RefObject<HTMLElement | null>, enabled: boolean): CSSProperties | undefined {
  useEffect(() => {
    const bar = ref.current;
    const host = bar?.parentElement;
    if (!enabled || !bar || !host) return;

    const previous = {
      stack: host.style.getPropertyValue(stackNavVar),
      minHeight: host.style.getPropertyValue('min-height'),
      overflowAnchor: host.style.getPropertyValue('overflow-anchor'),
    };
    // Through setProperty: the React Compiler refuses a property assignment on a value read from a hook argument
    host.style.setProperty('min-height', '100dvh');
    // Chrome otherwise moves the page when rows above the visible one leave, sliding the list under the element
    host.style.setProperty('overflow-anchor', 'none');

    const publish = () => host.style.setProperty(stackNavVar, `${bar.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      if (previous.stack) host.style.setProperty(stackNavVar, previous.stack);
      else host.style.removeProperty(stackNavVar);
      // An empty value removes the property
      host.style.setProperty('min-height', previous.minHeight);
      host.style.setProperty('overflow-anchor', previous.overflowAnchor);
    };
  }, [enabled]);

  return enabled ? { position: 'sticky', top: 0 } : undefined;
}

/**
 * Where a `hideWhenOutOfView` bar is: `flow` in its own place in the page, `pinned` slid in at the pin line, `hidden`
 * slid back out, `parked` just above the pin line without having animated there (its place had scrolled off anyway).
 */
type HidePhase = 'flow' | 'parked' | 'pinned' | 'hidden';

/**
 * Pins a header within its scroll container using CSS sticky positioning. Tall sidebars should
 * use plain sticky CSS. The bar pins at the larger of `--sticky-stack-top` (section bars, which
 * fold the nav offset in) and `--sticky-stack-nav` (page tabs), plus `offsetTop`. A bar that
 * publishes one of those variables never consumes it, since it would inherit its own value back
 * from the parent it publishes on. Variable changes animate with the ancestor bar's transition.
 */
export function StickyBox({
  enabled = true,
  offsetTop = 0,
  offsetBottom = 0,
  hideWhenOutOfView,
  publishVar,
  children,
  className,
  style,
  ...rest
}: StickyBoxProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [stuck, setStuck] = useState(false);
  const [phase, setPhase] = useState<HidePhase>('flow');
  // When set, the bar is docked near the container bottom via `position: relative` and scrolls away
  const [clampedTop, setClampedTop] = useState<number | null>(null);

  // `data-sticky` follows the sentinel: once it scrolls past the pin line the bar counts as stuck
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!enabled || !sentinel) {
      setStuck(false);
      return;
    }
    const scrollParent = getScrollParent(sentinel);
    const root = scrollParent instanceof HTMLElement ? scrollParent : null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const { rootBounds } = entry;
        if (!rootBounds) return;
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top < rootBounds.top);
      },
      { root, rootMargin: `${-offsetTop}px 0px 0px 0px`, threshold: [0] },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, offsetTop]);

  // Release sticky positioning early when the bar approaches the configured bottom offset.
  useEffect(() => {
    const bar = barRef.current;
    const parent = bar?.parentElement;
    if (!enabled || offsetBottom <= 0 || !bar || !parent) {
      setClampedTop(null);
      return;
    }
    const scrollParent = getScrollParent(bar);
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const parentRect = parent.getBoundingClientRect();
        const barHeight = bar.offsetHeight;
        const stickyBottom = viewportTopOf(scrollParent) + stackOffset(bar, publishVar) + offsetTop + barHeight;
        const spaceBelow = parentRect.bottom - stickyBottom;
        // Offset from the sentinel: at the release boundary it equals the stuck position exactly
        const naturalTop = sentinelRef.current?.getBoundingClientRect().top ?? parentRect.top;
        const releasedTop = parentRect.bottom - offsetBottom - barHeight - naturalTop;
        setClampedTop(spaceBelow <= offsetBottom ? Math.max(0, releasedTop) : null);
      });
    };
    check();
    scrollParent.addEventListener('scroll', check, passiveArg);
    window.addEventListener('resize', check, passiveArg);
    const observer = new ResizeObserver(check);
    observer.observe(parent);
    return () => {
      cancelAnimationFrame(raf);
      scrollParent.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      observer.disconnect();
    };
  }, [enabled, offsetBottom, offsetTop, publishVar]);

  // hideWhenOutOfView: the bar sits in its place while that is on screen, and slides in or out at the pin line by scroll direction once it is not
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const bar = barRef.current;
    if (!hideWhenOutOfView || !enabled || !sentinel || !bar) {
      setPhase('flow');
      return;
    }
    const scrollParent = getScrollParent(sentinel);
    let lastScrollY = scrollTopOf(scrollParent);
    let accumulated = 0;
    let scrollingUp = false;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const currentY = scrollTopOf(scrollParent);
        const delta = currentY - lastScrollY;
        // A direction counts once it has carried 10px; a programmatic scroll never reveals the bar
        accumulated = Math.sign(delta) === Math.sign(accumulated) ? accumulated + delta : delta;
        if (isProgrammaticScroll()) scrollingUp = false;
        else if (Math.abs(accumulated) > 10) scrollingUp = accumulated < 0;

        // The bar's own place, measured from the pin line: the sentinel marks its top wherever the bar itself is drawn
        const placeTop = sentinel.getBoundingClientRect().top - viewportTopOf(scrollParent) - offsetTop - stackOffset(bar, publishVar);
        const placeOffScreen = placeTop + bar.offsetHeight <= 0;

        setPhase((prev) => {
          if (placeTop >= 0) return 'flow';
          // Slid in: it stays pinned while its place scrolls back under it, and leaves on a scroll down
          if (prev === 'pinned') return placeOffScreen && !scrollingUp ? 'hidden' : 'pinned';
          if (!placeOffScreen) return 'flow';
          // From `flow` it parks for a frame first, so the slide in has a position to start from
          if (prev === 'flow') return 'parked';
          return scrollingUp ? 'pinned' : prev;
        });
        lastScrollY = currentY;
        ticking = false;
      });
    };
    scrollParent.addEventListener('scroll', onScroll, passiveArg);
    return () => scrollParent.removeEventListener('scroll', onScroll);
  }, [hideWhenOutOfView, enabled, offsetTop, publishVar]);

  // Publish the height on the parent so dependent sticky bars can pin below this one
  useEffect(() => {
    const bar = barRef.current;
    const host = bar?.parentElement;
    if (!publishVar || !enabled || !bar || !host) return;
    const publish = () => host.style.setProperty(publishVar, `${bar.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      host.style.removeProperty(publishVar);
    };
  }, [publishVar, enabled]);

  if (!enabled) {
    return (
      <div className={className} style={style} {...rest}>
        {children}
      </div>
    );
  }

  // `top` must never transition: it would interpolate the stuck/released switch and park at stale offsets
  const barStyle: CSSProperties = { ...style, position: 'sticky', top: `calc(${stackOffsetCss(publishVar)} + ${offsetTop}px)` };
  if (clampedTop !== null) {
    barStyle.position = 'relative';
    barStyle.top = clampedTop;
  }
  if (hideWhenOutOfView && clampedTop === null) {
    if (phase === 'flow') {
      // In its place it is ordinary content: it scrolls away with the page and never pins
      barStyle.position = 'relative';
      barStyle.top = undefined;
    } else {
      // No transition into `parked`: the bar leaves its place off screen, and an animated move would flash it at the pin line
      if (phase !== 'parked') barStyle.transition = 'transform 300ms ease, opacity 300ms ease';
      if (phase !== 'pinned') {
        barStyle.transform = 'translateY(-100%)';
        barStyle.opacity = 0;
        barStyle.pointerEvents = 'none';
      }
    }
  }

  // Only the sentinel precedes the bar, so its sticky containing block is the caller's parent
  return (
    <>
      <div ref={sentinelRef} aria-hidden className="pointer-events-none -mb-px h-px" />
      <div
        ref={barRef}
        className={className}
        data-sticky={stuck}
        style={barStyle}
        {...rest}
        // A keyboard reader who tabs into a bar that is slid out gets it slid in
        onFocus={(event) => {
          rest.onFocus?.(event);
          if (phase === 'parked' || phase === 'hidden') setPhase('pinned');
        }}
      >
        {children}
      </div>
    </>
  );
}
// ISC License

// Copyright (c) 2022, Daniel Berndt

// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.

// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
