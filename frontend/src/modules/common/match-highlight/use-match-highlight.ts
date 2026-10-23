import { type RefObject, useLayoutEffect } from 'react';
import { findMatchRanges } from 'shared/utils/text-match';
import { useMatchScope } from '~/modules/common/match-highlight/match-scope';

/** Name of the one `CSS.highlights` entry, styled by `::highlight(match)` in match-highlight.css. */
const highlightName = 'match';

const isHighlightApiSupported = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';

const getSharedHighlight = () => {
  const existing = CSS.highlights.get(highlightName);
  if (existing) return existing;
  const highlight = new Highlight();
  CSS.highlights.set(highlightName, highlight);
  return highlight;
};

/** The container's text nodes read as one string: a match may run across inline elements. */
const rangesIn = (container: HTMLElement, terms: string[]): StaticRange[] => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let text = '';
  for (let node = walker.nextNode(); node instanceof Text; node = walker.nextNode()) {
    nodes.push({ node, start: text.length });
    text += node.data;
  }

  const boundary = (offset: number, isEnd: boolean): [Text, number] | undefined => {
    for (const { node, start } of nodes) {
      const end = start + node.data.length;
      if (isEnd ? offset > start && offset <= end : offset >= start && offset < end) return [node, offset - start];
    }
    return undefined;
  };

  const ranges: StaticRange[] = [];
  for (const [start, end] of findMatchRanges(text, terms)) {
    const from = boundary(start, false);
    const to = boundary(end, true);
    if (from && to) ranges.push(new StaticRange({ startContainer: from[0], startOffset: from[1], endContainer: to[0], endOffset: to[1] }));
  }
  return ranges;
};

/**
 * Paints the scope's terms over HTML the app sets itself (sanitized documents, code) with the CSS Custom Highlight API,
 * which adds no DOM nodes. Text React renders takes `HighlightText`.
 */
export function useMatchHighlight(elementRef: RefObject<HTMLElement | null>): void {
  const terms = useMatchScope();

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || !isHighlightApiSupported || !terms.length) return;

    const highlight = getSharedHighlight();
    let paintedRanges: StaticRange[] = [];
    const paint = () => {
      for (const range of paintedRanges) highlight.delete(range);
      paintedRanges = rangesIn(element, terms);
      for (const range of paintedRanges) highlight.add(range);
    };

    let frame = 0;
    // A replaced text node drops its static ranges, so content changes repaint, once per frame
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    });
    paint();
    observer.observe(element, { childList: true, characterData: true, subtree: true });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const range of paintedRanges) highlight.delete(range);
    };
  }, [elementRef, terms]);
}
