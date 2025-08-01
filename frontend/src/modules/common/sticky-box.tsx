import { type ComponentProps, useEffect, useRef, useState } from 'react';

const getScrollParent = (node: HTMLElement) => {
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
};

const isOffsetElement = (el: HTMLElement): boolean => (el.firstChild ? (el.firstChild as HTMLElement).offsetParent === el : true);

const offsetTill = (node: HTMLElement, target: HTMLElement) => {
  let current = node;
  let finalTarget = target;

  let offset = 0;
  // If target is not an offsetParent itself, subtract its offsetTop and set correct target
  if (!isOffsetElement(target)) {
    offset += node.offsetTop - target.offsetTop;
    finalTarget = node.offsetParent as HTMLElement;
    offset += -node.offsetTop;
  }
  do {
    offset += current.offsetTop;
    current = current.offsetParent as HTMLElement;
  } while (current && current !== finalTarget);
  return offset;
};

const getParentNode = (node: HTMLElement) => {
  let currentParent = node.parentElement;
  while (currentParent) {
    const style = getComputedStyle(currentParent, null);
    if (style.getPropertyValue('display') !== 'contents') break;
    currentParent = currentParent.parentElement;
  }
  return currentParent || window;
};

let stickyProp: null | string = null;
if (typeof CSS !== 'undefined' && CSS.supports) {
  if (CSS.supports('position', 'sticky')) stickyProp = 'sticky';
  else if (CSS.supports('position', '-webkit-sticky')) stickyProp = '-webkit-sticky';
}

// Inspired by https://github.com/WICG/EventListenerOptions/blob/gh-pages/explainer.md#feature-detection
let passiveArg: false | { passive: true } = false;
try {
  const opts = Object.defineProperty({}, 'passive', {
    // eslint-disable-next-line getter-return
    get() {
      passiveArg = { passive: true };
    },
  });
  const emptyHandler = () => {};
  window.addEventListener('testPassive', emptyHandler, opts);
  window.removeEventListener('testPassive', emptyHandler, opts);
} catch (e) {}

/*

prop overview:

scroll parent
=============
- scrollY (onScroll)
- scrollParentHeight (onResize)
- scrollParentOffsetTop (onResize)

parent
======
- naturalTop (onResize)
- parentHeight (onResize)

sticky
======
- nodeHeight (onResize)
- offset (onResize)


Fns
===
reLayout() (also called on init)
onScroll()
*/

type UnsubList = (() => void)[];
type MeasureFn<T extends object> = (opts: { top: number; left: number; height: number; width: number }) => T;

const getDimensions = <T extends object>(opts: { el: HTMLElement | Window; onChange: () => void; unsubs: UnsubList; measure: MeasureFn<T> }): T => {
  const { el, onChange, unsubs, measure } = opts;
  if (el === window) {
    const getRect = () => ({ top: 0, left: 0, height: window.innerHeight, width: window.innerWidth });
    const mResult = measure(getRect());
    const handler = () => {
      Object.assign(mResult, measure(getRect()));
      onChange();
    };
    window.addEventListener('resize', handler, passiveArg);
    unsubs.push(() => window.removeEventListener('resize', handler));
    return mResult;
  }
  const mResult = measure((el as HTMLElement).getBoundingClientRect());
  const handler: ResizeObserverCallback = () => {
    // Note the e[0].contentRect is different from `getBoundingClientRect`
    Object.assign(mResult, measure((el as HTMLElement).getBoundingClientRect()));
    onChange();
  };
  const ro = new ResizeObserver(handler);
  ro.observe(el as HTMLElement);
  unsubs.push(() => ro.disconnect());
  return mResult;
};

const getVerticalPadding = (node: HTMLElement) => {
  const computedParentStyle = getComputedStyle(node, null);
  const parentPaddingTop = Number.parseInt(computedParentStyle.getPropertyValue('padding-top'), 10);
  const parentPaddingBottom = Number.parseInt(computedParentStyle.getPropertyValue('padding-bottom'), 10);
  return { top: parentPaddingTop, bottom: parentPaddingBottom };
};

enum MODES {
  stickyTop,
  stickyBottom,
  relative,
  small,
}

type StickyMode = null | (typeof MODES)[keyof typeof MODES];

const setup = (node: HTMLElement, unsubs: UnsubList, opts: Required<StickyBoxConfig>) => {
  const { bottom, offsetBottom, offsetTop } = opts;
  const scrollPane = getScrollParent(node);

  let isScheduled = false;
  const scheduleOnLayout = () => {
    if (!isScheduled) {
      requestAnimationFrame(() => {
        const nextMode = onLayout();
        if (nextMode !== mode) {
          changeMode(nextMode);
        } else if (nextMode === MODES.stickyBottom && !bottom) {
          // ensure it still is at bottom
          const { height: viewPortHeight } = scrollPaneDims;
          const { height: nodeHeight } = nodeDims;
          node.style.top = `${viewPortHeight - nodeHeight - offsetBottom}px`;
        } else if (nextMode === MODES.relative) {
          const { height: viewPortHeight, offsetTop: scrollPaneOffset } = scrollPaneDims;
          const { height: parentHeight, naturalTop } = parentDims;
          const { height: nodeHeight } = nodeDims;
          const relativeOffset = Math.max(0, scrollPaneOffset + latestScrollY + viewPortHeight - (naturalTop + nodeHeight + offsetBottom));
          if (bottom) {
            const nextBottom = Math.max(0, parentHeight - nodeHeight - relativeOffset);
            node.style.bottom = `${nextBottom}px`;
          } else {
            node.style.top = `${relativeOffset}px`;
          }
        }
        isScheduled = false;
      });
    }
    isScheduled = true;
  };

  let latestScrollY = scrollPane === window ? window.scrollY : (scrollPane as HTMLElement).scrollTop;

  const isBoxTooLow = (scrollY: number) => {
    const { offsetTop: scrollPaneOffset, height: viewPortHeight } = scrollPaneDims;
    const { naturalTop } = parentDims;
    const { height: nodeHeight } = nodeDims;

    if (scrollY + scrollPaneOffset + viewPortHeight >= naturalTop + nodeHeight + relativeOffset + offsetBottom) {
      return true;
    }
    return false;
  };

  const onLayout = (): StickyMode => {
    const { height: viewPortHeight } = scrollPaneDims;
    const { height: nodeHeight } = nodeDims;
    if (nodeHeight + offsetTop + offsetBottom <= viewPortHeight) {
      return MODES.small;
    }
    if (isBoxTooLow(latestScrollY)) {
      return MODES.stickyBottom;
    }
    return MODES.relative;
  };

  const scrollPaneIsOffsetEl = scrollPane !== window && isOffsetElement(scrollPane as HTMLElement);
  const scrollPaneDims = getDimensions({
    el: scrollPane,
    onChange: scheduleOnLayout,
    unsubs,
    measure: ({ height, top }) => ({
      height,
      offsetTop: scrollPaneIsOffsetEl ? top : 0,
    }),
  });

  const parentNode = getParentNode(node);
  const parentPaddings = parentNode === window ? { top: 0, bottom: 0 } : getVerticalPadding(parentNode as HTMLElement);
  const parentDims = getDimensions({
    el: parentNode,
    onChange: scheduleOnLayout,
    unsubs,
    measure: ({ height }) => ({
      height: height - parentPaddings.top - parentPaddings.bottom,
      naturalTop:
        parentNode === window ? 0 : offsetTill(parentNode as HTMLElement, scrollPane as HTMLElement) + parentPaddings.top + scrollPaneDims.offsetTop,
    }),
  });

  const nodeDims = getDimensions({
    el: node,
    onChange: scheduleOnLayout,
    unsubs,
    measure: ({ height }) => ({ height }),
  });

  let relativeOffset = 0;
  let mode = onLayout();

  const changeMode = (newMode: StickyMode) => {
    const prevMode = mode;
    mode = newMode;
    if (prevMode === MODES.relative) relativeOffset = -1;
    if (newMode === MODES.small) {
      if (stickyProp) {
        node.style.position = stickyProp;
      }
      if (bottom) {
        node.style.bottom = `${offsetBottom}px`;
      } else {
        node.style.top = `${offsetTop}px`;
      }
      return;
    }

    const { height: viewPortHeight, offsetTop: scrollPaneOffset } = scrollPaneDims;
    const { height: parentHeight, naturalTop } = parentDims;
    const { height: nodeHeight } = nodeDims;
    if (newMode === MODES.relative) {
      node.style.position = 'relative';
      relativeOffset =
        prevMode === MODES.stickyTop
          ? Math.max(0, scrollPaneOffset + latestScrollY - naturalTop + offsetTop)
          : Math.max(0, scrollPaneOffset + latestScrollY + viewPortHeight - (naturalTop + nodeHeight + offsetBottom));
      if (bottom) {
        const nextBottom = Math.max(0, parentHeight - nodeHeight - relativeOffset);
        node.style.bottom = `${nextBottom}px`;
      } else {
        node.style.top = `${relativeOffset}px`;
      }
    } else {
      if (stickyProp) {
        node.style.position = stickyProp;
      }
      if (newMode === MODES.stickyBottom) {
        if (bottom) {
          node.style.bottom = `${offsetBottom}px`;
        } else {
          node.style.top = `${viewPortHeight - nodeHeight - offsetBottom}px`;
        }
      } else {
        // stickyTop
        if (bottom) {
          node.style.bottom = `${viewPortHeight - nodeHeight - offsetBottom}px`;
        } else {
          node.style.top = `${offsetTop}px`;
        }
      }
    }
  };
  changeMode(mode);

  const onScroll = (scrollY: number) => {
    if (scrollY === latestScrollY) return;
    const scrollDelta = scrollY - latestScrollY;
    latestScrollY = scrollY;
    if (mode === MODES.small) return;

    const { offsetTop: scrollPaneOffset, height: viewPortHeight } = scrollPaneDims;
    const { naturalTop, height: parentHeight } = parentDims;
    const { height: nodeHeight } = nodeDims;

    if (scrollDelta > 0) {
      // scroll down
      if (mode === MODES.stickyTop) {
        if (scrollY + scrollPaneOffset + offsetTop > naturalTop) {
          const topOffset = Math.max(0, scrollPaneOffset + latestScrollY - naturalTop + offsetTop);
          if (scrollY + scrollPaneOffset + viewPortHeight <= naturalTop + nodeHeight + topOffset + offsetBottom) {
            changeMode(MODES.relative);
          } else {
            changeMode(MODES.stickyBottom);
          }
        }
      } else if (mode === MODES.relative) {
        if (isBoxTooLow(scrollY)) changeMode(MODES.stickyBottom);
      }
    } else {
      // scroll up
      if (mode === MODES.stickyBottom) {
        if (scrollPaneOffset + scrollY + viewPortHeight < naturalTop + parentHeight + offsetBottom) {
          const bottomOffset = Math.max(0, scrollPaneOffset + latestScrollY + viewPortHeight - (naturalTop + nodeHeight + offsetBottom));
          if (scrollPaneOffset + scrollY + offsetTop >= naturalTop + bottomOffset) {
            changeMode(MODES.relative);
          } else {
            changeMode(MODES.stickyTop);
          }
        }
      } else if (mode === MODES.relative) {
        if (scrollPaneOffset + scrollY + offsetTop < naturalTop + relativeOffset) {
          changeMode(MODES.stickyTop);
        }
      }
    }
  };

  const handleScroll = scrollPane === window ? () => onScroll(window.scrollY) : () => onScroll((scrollPane as HTMLElement).scrollTop);

  scrollPane.addEventListener('scroll', handleScroll, passiveArg);
  scrollPane.addEventListener('mousewheel', handleScroll, passiveArg);
  unsubs.push(
    () => scrollPane.removeEventListener('scroll', handleScroll),
    () => scrollPane.removeEventListener('mousewheel', handleScroll),
  );
};

export type StickyBoxConfig = {
  offsetTop?: number;
  offsetBottom?: number;
  bottom?: boolean;
  enabled?: boolean;
};

export type UseStickyBoxOptions = StickyBoxConfig;

export const useStickyBox = ({ offsetTop = 0, offsetBottom = 0, bottom = false, enabled = true }: StickyBoxConfig = {}) => {
  if (!enabled) return [() => {}, false] as const;

  const [node, setNode] = useState<HTMLElement | null>(null);
  const [isSticky, setIsSticky] = useState<boolean>(false);

  useEffect(() => {
    if (!node || !stickyProp) return;
    const unsubs: UnsubList = [];
    setup(node, unsubs, { offsetBottom, offsetTop, bottom, enabled });

    let lastIsSticky = false; // Store last known sticky state
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          const isStickyNow = calculateIsSticky(node, offsetTop, offsetBottom, bottom);

          if (isStickyNow !== lastIsSticky) {
            setIsSticky(isStickyNow); // Only update state if value changed
            lastIsSticky = isStickyNow;
          }

          ticking = false;
        });
      }
    };

    const calculateIsSticky = (el: HTMLElement, offsetTop: number, offsetBottom: number, bottom: boolean) => {
      const rect = el.getBoundingClientRect();
      return bottom ? rect.bottom <= window.innerHeight - offsetBottom : rect.top <= offsetTop;
    };

    window.addEventListener('scroll', handleScroll, passiveArg);
    handleScroll(); // Initial check

    return () => {
      unsubs.forEach((fn) => fn());
      window.removeEventListener('scroll', handleScroll);
    };
  }, [node, offsetBottom, offsetTop, bottom, enabled]);

  return [setNode, isSticky] as const;
};

export type StickyBoxCompProps = StickyBoxConfig & Pick<ComponentProps<'div'>, 'children' | 'className' | 'style'>;

const StickyBox = (props: StickyBoxCompProps) => {
  const { enabled = true, offsetTop, offsetBottom, bottom, children, className, style } = props;

  const ref = useRef<HTMLDivElement>(null);
  const [setRef, isSticky] = useStickyBox({ offsetTop, offsetBottom, bottom, enabled });

  useEffect(() => {
    if (ref.current) setRef(ref.current);
  }, [setRef]);

  const stickyClass = isSticky ? 'group/sticky is-sticky' : '';

  return (
    <div className={`${className} ${stickyClass}`} style={style} ref={ref}>
      {children}
    </div>
  );
};

export default StickyBox;

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
