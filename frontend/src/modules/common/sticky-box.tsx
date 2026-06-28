import { type ComponentProps, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isProgrammaticScroll } from '~/hooks/use-scroll-spy-store';

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
  /** Disable sticky behaviour entirely (renders children in a plain div). */
  enabled?: boolean;
  /** Hide the bar while scrolling down and reveal it while scrolling up. */
  hideWhenOutOfView?: boolean;
  /**
   * Classes for the in-flow placeholder wrapper. Use this for breathing-room
   * margin (e.g. `my-2`) so it stays symmetric and scrolls away when affixed —
   * margin on the bar itself would offset the fixed position.
   */
  placeholderClassName?: string;
};

/**
 * Affix header that pins to the top of its scroll container. When it sticks, the
 * bar pops out of flow (`position: fixed`) and a placeholder reserves its natural
 * height — so the affixed bar can resize (e.g. shrink padding via `data-sticky`)
 * without reflowing the content below.
 *
 * Not for tall sticky *sidebars*: use plain CSS instead —
 * `sticky top-X max-h-[calc(100vh-…)] overflow-y-auto`.
 */
export function StickyBox({
  enabled = true,
  offsetTop = 0,
  hideWhenOutOfView,
  children,
  className,
  placeholderClassName,
  style,
  ...rest
}: StickyBoxProps) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Last measured in-flow height of the bar, captured while not stuck.
  const naturalHeightRef = useRef(0);

  const [stuck, setStuck] = useState(false);
  const [visible, setVisible] = useState(true);
  const [metrics, setMetrics] = useState<{ left: number; width: number; top: number; height: number } | null>(null);
  // While unsticking, keep reserving the bar's height until its size transition
  // settles, so the in-flow resize doesn't reflow the content below.
  const [settling, setSettling] = useState(false);
  const reservedHeightRef = useRef(0);
  const prevStuckRef = useRef(false);

  // Detect the stuck state with a zero-height sentinel at the bar's natural top.
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

  // Track the bar's natural height while in flow, so the placeholder can reserve
  // exactly that space the moment the bar pops out to `position: fixed`.
  useEffect(() => {
    const bar = barRef.current;
    if (stuck || !bar) return;
    const update = () => {
      naturalHeightRef.current = bar.offsetHeight;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [stuck]);

  // While stuck, keep the fixed bar aligned to where the placeholder sits.
  useLayoutEffect(() => {
    if (!enabled || !stuck) {
      setMetrics(null);
      return;
    }
    const placeholder = placeholderRef.current;
    if (!placeholder) return;
    const scrollParent = getScrollParent(placeholder);

    const measure = () => {
      const rect = placeholder.getBoundingClientRect();
      const containerTop = scrollParent === window ? 0 : (scrollParent as HTMLElement).getBoundingClientRect().top;
      setMetrics({
        left: rect.left,
        width: rect.width,
        top: containerTop + offsetTop,
        height: naturalHeightRef.current,
      });
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(placeholder);
    window.addEventListener('resize', measure, passiveArg);
    // A fixed element is viewport-anchored, so only an element scroller needs re-sync.
    const syncScroll = scrollParent !== window;
    if (syncScroll) scrollParent.addEventListener('scroll', measure, passiveArg);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      if (syncScroll) scrollParent.removeEventListener('scroll', measure);
    };
  }, [enabled, stuck, offsetTop]);

  // hideWhenOutOfView: reveal on scroll up, hide on scroll down, always show at top.
  useEffect(() => {
    if (!hideWhenOutOfView || !enabled || !placeholderRef.current) return;
    const scrollParent = getScrollParent(placeholderRef.current);
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

  // Remember the reserved (natural) height while stuck so it can be held during
  // the un-stick transition below.
  useEffect(() => {
    if (stuck && metrics) reservedHeightRef.current = metrics.height;
  }, [stuck, metrics]);

  // On unstick, keep the placeholder reserving the natural height until the bar's
  // size transition finishes — otherwise releasing the placeholder while the bar
  // is still animating back to full size reflows the content below (jump + glide).
  useEffect(() => {
    const wasStuck = prevStuckRef.current;
    prevStuckRef.current = stuck;
    if (!wasStuck || stuck) return;

    setSettling(true);
    const bar = barRef.current;
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      bar?.removeEventListener('transitionend', onEnd);
      setSettling(false);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === bar && e.propertyName.startsWith('padding')) finish();
    };
    bar?.addEventListener('transitionend', onEnd);
    // Fallback in case the bar has no size transition to listen for.
    timer = window.setTimeout(finish, 350);
    return () => {
      window.clearTimeout(timer);
      bar?.removeEventListener('transitionend', onEnd);
    };
  }, [stuck]);

  const barStyle: React.CSSProperties = { ...style };
  if (stuck && metrics) {
    barStyle.position = 'fixed';
    barStyle.top = metrics.top;
    barStyle.left = metrics.left;
    barStyle.width = metrics.width;
  }
  if (hideWhenOutOfView && enabled) {
    barStyle.transition = 'transform 300ms ease, opacity 300ms ease';
    if (!visible) {
      barStyle.transform = 'translateY(-100%)';
      barStyle.opacity = 0;
      barStyle.pointerEvents = 'none';
    }
  }

  // Placeholder reserves the bar's natural height while stuck — and through the
  // un-stick transition — so the bar can resize without reflowing content below.
  const placeholderStyle: React.CSSProperties | undefined =
    stuck && metrics ? { height: metrics.height } : settling ? { height: reservedHeightRef.current } : undefined;

  return (
    <div ref={placeholderRef} className={placeholderClassName} style={placeholderStyle}>
      <div ref={sentinelRef} aria-hidden className="pointer-events-none -mb-px h-px" />
      <div ref={barRef} className={className} data-sticky={stuck} style={barStyle} {...rest}>
        {children}
      </div>
    </div>
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
