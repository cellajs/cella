import type { Page } from 'playwright';
import type { ScopeState } from '../scope.ts';
import type { Session } from '../session.ts';
import { type EvidenceSet, visit } from './visit.ts';

/** Content that may scroll in two dimensions under 1.4.10: data grids, tables, code. */
const twoDimensional = '[role="grid"], table, pre, code, [data-slot="table-container"]';

/** Text, images and controls cut off by the viewport edge with no scroll to reach them, plus sideways page scroll. */
function horizontalOverflow(page: Page) {
  return page.evaluate((exempt) => {
    const width = document.documentElement.clientWidth;
    const problems: string[] = [];
    const pageScroll = document.documentElement.scrollWidth - width;
    if (pageScroll > 1) problems.push(`page scrolls ${pageScroll}px sideways`);

    const reachable = (el: Element) => {
      if (el.closest(exempt) || el.closest('[aria-hidden="true"], [inert]')) return true;
      for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.position === 'fixed' || style.visibility === 'hidden') return true;
        if (node !== el && (style.overflowX === 'auto' || style.overflowX === 'scroll')) return true;
      }
      return false;
    };
    const outside = (rect: DOMRect) => rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > width + 1);
    const cut = new Set<string>();

    // Text: a container may be wider than the screen while its text still fits, so measure the text itself
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && cut.size < 4; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || reachable(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some(outside)) cut.add(`text "${text.slice(0, 40)}"`);
    }
    for (const el of document.querySelectorAll('img, svg, video, canvas, button, a[href], input, select, textarea')) {
      if (cut.size >= 4) break;
      if (el.tagName.toLowerCase() === 'svg' && el.parentElement?.closest('svg')) continue;
      if (outside(el.getBoundingClientRect()) && !reachable(el)) {
        const name = el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? el.textContent?.trim().slice(0, 30) ?? '';
        cut.add(`${el.tagName.toLowerCase()}${name ? ` "${name}"` : ''}`);
      }
    }
    for (const item of cut) problems.push(`${item} is cut off at the edge`);
    return problems;
  }, twoDimensional);
}

const spacingCss = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
p { margin-bottom: 2em !important; }`;

/** Text-bearing elements whose content no longer fits their clipping box. */
function clippedText(page: Page) {
  return page.evaluate(() => {
    const clipped: string[] = [];
    const path = (el: Element) => {
      const parts: string[] = [];
      for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
        const index = node.parentElement ? [...node.parentElement.children].indexOf(node) : 0;
        parts.unshift(`${node.tagName.toLowerCase()}:${index}`);
      }
      return parts.join('>');
    };
    for (const el of document.body.querySelectorAll('*')) {
      const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      if (!ownText || !(el instanceof HTMLElement) || !el.offsetParent) continue;
      const style = getComputedStyle(el);
      const clips = ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY);
      if (!clips) continue;
      if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) {
        clipped.push(`${path(el)}|${(el.textContent ?? '').trim().slice(0, 40)}`);
      }
    }
    return clipped;
  });
}

/** Reflow at 320px (1.4.10), 200% zoom as a 640px viewport (1.4.4), text spacing (1.4.12) and both orientations (1.3.4). */
export async function probeLayout(session: Session, states: ScopeState[], evidence: EvidenceSet) {
  const reflow = await visit(session, states, { viewport: { width: 320, height: 640 } }, horizontalOverflow);
  evidence.addFromProblems(['1.4.10'], 'probe:reflow', 'Content fits a 320px-wide viewport without sideways scrolling', reflow);

  const zoom = await visit(session, states, { viewport: { width: 640, height: 450 } }, horizontalOverflow);
  evidence.addFromProblems(['1.4.4'], 'probe:resize', 'Content fits at 200% zoom (a 640px viewport) without loss', zoom);

  const spacing = await visit(session, states, {}, async (page) => {
    const before = new Set(await clippedText(page));
    await page.addStyleTag({ content: spacingCss });
    await page.waitForTimeout(300);
    const after = await clippedText(page);
    return after.filter((entry) => !before.has(entry)).map((entry) => `"${entry.split('|')[1]}" is cut off`);
  });
  evidence.addFromProblems(['1.4.12'], 'probe:text-spacing', 'Text stays fully visible with WCAG text spacing applied', spacing);

  const pages = states.filter((state) => !state.open);
  const textLength = (page: Page) =>
    page
      .locator('body')
      .innerText()
      .then((text) => text.length);
  const portrait = await visit(session, pages, { viewport: { width: 390, height: 844 } }, textLength);
  const landscape = await visit(session, pages, { viewport: { width: 844, height: 390 } }, textLength);
  const orientation = new Map(
    [...portrait].map(([id, length]) => {
      const other = landscape.get(id) ?? 0;
      // Narrow layouts show fewer grid rows and columns; only content that disappears counts
      return [id, Math.min(length, other) < Math.max(length, other) * 0.2 ? [`portrait shows ${length} characters, landscape ${other}`] : []];
    }),
  );
  evidence.addFromProblems(['1.3.4'], 'probe:orientation', 'The same content shows in portrait and landscape', orientation);
}
