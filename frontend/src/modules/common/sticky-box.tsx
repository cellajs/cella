import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { isProgrammaticScroll } from '~/hooks/use-scroll-spy-store';
import { cn } from '~/utils/cn';

function getScrollParent(node: HTMLElement) {
  let parent: HTMLElement | null = node;
  // biome-ignore lint/suspicious/noAssignInExpressions: required for short-circuit assignment pattern
  while ((parent = parent.parentElement)) {
    const overflowYVal = getComputedStyle(parent, null).getPropertyValue('overflow-y');
    if (parent === document.body) return window;
    if (overflowYVal === 'auto' || overflowYVal === 'scroll' || overflowYVal === 'overlay') {
      return parent;
    }
  }
  return window;
}

// Passive event listeners are baseline in all supported browsers.
const passiveArg = { passive: true } as const;

type StickyBoxProps = Omit<ComponentProps<'div'>, 'ref'> & {
  /** Offset (px) from the top of the scroll container at which the bar pins. */
  offsetTop?: number;
  /** Release the bar this many px before the bottom of its containing block (e.g. to clear a footer). */
  offsetBottom?: number;
  /** Disable sticky behaviour entirely (renders children in a plain div). */
  enabled?: boolean;
  /** Hide the bar while scrolling down and reveal it while scrolling up. */
  hideWhenOutOfView?: boolean;
  /**
   * Classes for the zero-height sentinel that marks the bar's natural top. Use
   * this for breathing-room margin (e.g. `my-2`) around the pin point.
   */
  placeholderClassName?: string;
  /**
   * CSS custom property name to publish the bar's height to (on the parent element),
   * e.g. `--sticky-stack-nav` for page tabs that lower sticky bars pin below.
   */
  publishVar?: string;
};

/**
 * Pins a header within its scroll container using CSS sticky positioning.
 * A sentinel observer drives styling state, and `offsetBottom` releases the bar before the
 * container edge. Tall sidebars should use plain sticky CSS.
 *
 * Stacking: the bar pins below the sticky layers above it, at the larger of
 * `--sticky-stack-top` (section bars, which fold the nav offset in) and
 * `--sticky-stack-nav` (page tabs), plus `offsetTop`. A bar publishing one of these
 * variables via `publishVar` never consumes that variable itself, since it inherits its
 * own published value from the parent it publishes on. Variable changes animate,
 * tracking the ancestor bar's show/hide transition.
 */
const STACK_VARS = ['--sticky-stack-nav', '--sticky-stack-top'] as const;
/** Renders the sticky box component. */
export function StickyBox({
  enabled = true,
  offsetTop = 0,
  offsetBottom = 0,
  hideWhenOutOfView,
  publishVar,
  children,
  className,
  placeholderClassName,
  style,
  ...rest
}: StickyBoxProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [stuck, setStuck] = useState(false);
  const [visible, setVisible] = useState(true);
  // When set, the bar is docked near the container bottom (offsetBottom release)
  // via `position: relative`, so it scrolls away with content.
  const [clampedTop, setClampedTop] = useState<number | null>(null);

  // Source of truth for `data-sticky`: a zero-height sentinel at the bar's
  // natural top. Once it scrolls past the pin line, the bar is considered stuck.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!enabled || !sentinel) {
      setStuck(false);
      return;
    }
    const scrollParent = getScrollParent(sentinel);
    const root = scrollParent === window ? null : (scrollParent as HTMLElement);
    const io = new IntersectionObserver(
      ([entry]) => {
        const rb = entry.rootBounds;
        if (!rb) return;
        setStuck(!entry.isIntersecting && entry.boundingClientRect.top < rb.top);
      },
      { root, rootMargin: `${-offsetTop}px 0px 0px 0px`, threshold: [0] },
    );
    io.observe(sentinel);
    return () => io.disconnect();
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
        const scrollTop = scrollParent === window ? 0 : (scrollParent as HTMLElement).getBoundingClientRect().top;
        const barStyles = getComputedStyle(bar);
        const stackPx = Math.max(
          ...STACK_VARS.filter((v) => v !== publishVar).map(
            (v) => Number.parseFloat(barStyles.getPropertyValue(v)) || 0,
          ),
        );
        const stickyBottom = scrollTop + stackPx + offsetTop + barHeight;
        const spaceBelow = parentRect.bottom - stickyBottom;
        // Relative offset from the bar's natural top, marked by the sentinel: at the release
        // boundary this equals the stuck position exactly, so the mode switch is seamless
        // regardless of parent padding or content preceding the bar.
        const naturalTop = sentinelRef.current?.getBoundingClientRect().top ?? parentRect.top;
        const releasedTop = parentRect.bottom - offsetBottom - barHeight - naturalTop;
        setClampedTop(spaceBelow <= offsetBottom ? Math.max(0, releasedTop) : null);
      });
    };
    check();
    scrollParent.addEventListener('scroll', check, passiveArg);
    window.addEventListener('resize', check, passiveArg);
    const ro = new ResizeObserver(check);
    ro.observe(parent);
    return () => {
      cancelAnimationFrame(raf);
      scrollParent.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      ro.disconnect();
    };
  }, [enabled, offsetBottom, offsetTop, publishVar]);

  // hideWhenOutOfView: reveal on scroll up, hide on scroll down, always show at top.
  useEffect(() => {
    if (!hideWhenOutOfView || !enabled || !sentinelRef.current) return;
    const scrollParent = getScrollParent(sentinelRef.current);
    let lastScrollY = scrollParent === window ? window.scrollY : (scrollParent as HTMLElement).scrollTop;
    let accumulated = 0;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const currentY = scrollParent === window ? window.scrollY : (scrollParent as HTMLElement).scrollTop;
        const delta = currentY - lastScrollY;
        if (currentY <= offsetTop) {
          setVisible(true);
          accumulated = 0;
        } else if (isProgrammaticScroll()) {
          setVisible(false);
          accumulated = 0;
        } else {
          accumulated = Math.sign(delta) === Math.sign(accumulated) ? accumulated + delta : delta;
          if (accumulated > 10) {
            setVisible(false);
            accumulated = 0;
          } else if (accumulated < -10) {
            setVisible(true);
            accumulated = 0;
          }
        }
        lastScrollY = currentY;
        ticking = false;
      });
    };
    scrollParent.addEventListener('scroll', onScroll, passiveArg);
    return () => scrollParent.removeEventListener('scroll', onScroll);
  }, [hideWhenOutOfView, enabled, offsetTop]);

  // Ensure visible again whenever the bar is back in its natural position.
  useEffect(() => {
    if (hideWhenOutOfView && !stuck) setVisible(true);
  }, [hideWhenOutOfView, stuck]);

  // Publish the bar's height under `publishVar` on the parent, so dependent sticky
  // stacks (section bars, card headers) can pin below this bar.
  useEffect(() => {
    const bar = barRef.current;
    const host = bar?.parentElement;
    if (!publishVar || !enabled || !bar || !host) return;
    const publish = () => host.style.setProperty(publishVar, `${bar.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(bar);
    return () => {
      ro.disconnect();
      host.style.removeProperty(publishVar);
    };
  }, [publishVar, enabled]);

  // Disabled: render children in a plain div (no sentinel, no sticky).
  if (!enabled) {
    return (
      <div className={className} style={style} {...rest}>
        {children}
      </div>
    );
  }

  // `top` itself must never transition: the stack offset animates via the registered
  // stack properties on their publishers, and a top transition here would also
  // interpolate the stuck/released mode switch, parking the bar at stale offsets.
  const consumedVars = STACK_VARS.filter((v) => v !== publishVar).map((v) => `var(${v}, 0px)`);
  const stackExpr = consumedVars.length > 1 ? `max(${consumedVars.join(', ')})` : (consumedVars[0] ?? '0px');
  const barStyle: React.CSSProperties = {
    ...style,
    position: 'sticky',
    top: `calc(${stackExpr} + ${offsetTop}px)`,
  };
  if (clampedTop !== null) {
    barStyle.position = 'relative';
    barStyle.top = clampedTop;
  }
  if (hideWhenOutOfView) {
    barStyle.transition = 'transform 300ms ease, opacity 300ms ease';
    if (!visible) {
      barStyle.transform = 'translateY(-100%)';
      barStyle.opacity = 0;
      barStyle.pointerEvents = 'none';
    }
  }

  // The bar is a near-direct child (only preceded by the sentinel) so its sticky
  // containing block is the caller's parent, letting it travel the full content.
  return (
    <>
      <div ref={sentinelRef} aria-hidden className={cn('pointer-events-none -mb-px h-px', placeholderClassName)} />
      <div ref={barRef} className={className} data-sticky={stuck} style={barStyle} {...rest}>
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
