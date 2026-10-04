import type { Page } from 'playwright';
import type { Check } from '../findings.ts';

/** Text nodes measured per visit; nodes that share tag and classes share their colours, so one of each kind is measured. */
const maxTextNodes = 60;

interface Measured {
  text: string;
  ratio: number;
  needed: number;
}

/**
 * Contrast of the text axe leaves undecided (over a gradient, an image or a pseudo-element, or too short to judge),
 * measured from rendered pixels: the element is captured with its text and with the text made transparent, and the
 * text colour is compared with what lies behind each text pixel.
 */
export const textContrast =
  (targets: string[]): Check =>
  async (page) => {
    if (!targets.length) return [];
    const measured: Measured[] = [];
    const kinds = new Set<string>();

    for (const target of targets) {
      if (kinds.size >= maxTextNodes) break;
      const locator = page.locator(target).first();
      const info = await locator
        .evaluate((el) => {
          const style = getComputedStyle(el);
          const size = Number.parseFloat(style.fontSize);
          const ownText = [...el.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent?.trim())
            .join(' ')
            .trim();
          return {
            kind: `${el.tagName}|${el.getAttribute('class') ?? ''}|${style.color}|${style.opacity}`,
            text: (ownText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
            // Decoration, and controls that cannot be used, are outside the criterion
            exempt: !!el.closest('[aria-hidden="true"], :disabled, [aria-disabled="true"]') || !el.getClientRects().length,
            large: size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700),
            clipped: style.backgroundClip.includes('text') || style.webkitBackgroundClip?.includes('text'),
          };
        })
        .catch(() => null);
      if (!info || info.exempt || !info.text || kinds.has(info.kind)) continue;
      kinds.add(info.kind);

      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
        const shot = () => locator.screenshot({ animations: 'disabled', caret: 'hide', timeout: 4000 });
        const withText = await shot();
        // Text painted through a clipped background disappears with the element; any other text by losing its colour
        await locator.evaluate((el, clipped) => {
          const node = el as HTMLElement;
          node.dataset.a11yStyle = node.getAttribute('style') ?? '';
          if (clipped) node.style.setProperty('opacity', '0', 'important');
          else {
            node.style.setProperty('color', 'transparent', 'important');
            node.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
            node.style.setProperty('text-shadow', 'none', 'important');
          }
        }, info.clipped);
        const withoutText = await shot().finally(() =>
          locator.evaluate((el) => {
            const node = el as HTMLElement;
            node.setAttribute('style', node.dataset.a11yStyle ?? '');
            delete node.dataset.a11yStyle;
          }),
        );

        const ratio = await page.evaluate(
          async ([a, b]) => {
            const pixels = async (base64: string) => {
              const image = new Image();
              image.src = `data:image/png;base64,${base64}`;
              await image.decode();
              const canvas = document.createElement('canvas');
              canvas.width = image.width;
              canvas.height = image.height;
              const context = canvas.getContext('2d', { willReadFrequently: true });
              if (!context) return null;
              context.drawImage(image, 0, 0);
              return context.getImageData(0, 0, canvas.width, canvas.height).data;
            };
            const [text, behind] = [await pixels(a), await pixels(b)];
            if (!text || !behind || text.length !== behind.length) return null;
            const luminance = (data: Uint8ClampedArray, i: number) => {
              const channel = (value: number) => {
                const s = value / 255;
                return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
              };
              return 0.2126 * channel(data[i]) + 0.7152 * channel(data[i + 1]) + 0.0722 * channel(data[i + 2]);
            };
            // The pixel that changed most is fully covered by a glyph: it carries the text colour
            let strongest = 0;
            let at = -1;
            const covered: number[] = [];
            for (let i = 0; i < text.length; i += 4) {
              const change = Math.max(Math.abs(text[i] - behind[i]), Math.abs(text[i + 1] - behind[i + 1]), Math.abs(text[i + 2] - behind[i + 2]));
              if (change > 6) covered.push(i);
              if (change > strongest) {
                strongest = change;
                at = i;
              }
            }
            if (at < 0 || strongest < 12 || covered.length < 8) return null;
            const textLuminance = luminance(text, at);
            // Against what lies behind each glyph pixel; the low end counts, so a gradient is judged where it is weakest
            const ratios = covered
              .map((i) => {
                const background = luminance(behind, i);
                return (Math.max(textLuminance, background) + 0.05) / (Math.min(textLuminance, background) + 0.05);
              })
              .sort((x, y) => x - y);
            return Math.round(ratios[Math.floor(ratios.length * 0.05)] * 100) / 100;
          },
          [withText.toString('base64'), withoutText.toString('base64')] as const,
        );
        // No measurable text: a field's value or placeholder, which this capture does not hide
        if (ratio !== null) measured.push({ text: info.text, ratio, needed: info.large ? 3 : 4.5 });
      } catch {
        // An element that left the page between the scan and the capture is not measured
      }
    }

    if (!measured.length) return [];
    const problems = measured
      .filter(({ ratio, needed }) => ratio < needed)
      .map(({ text, ratio, needed }) => `"${text}" is ${ratio}:1, needs ${needed}:1`);
    const lowest = Math.min(...measured.map(({ ratio }) => ratio));
    return [
      {
        criteria: ['1.4.3'],
        check: 'probe:text-contrast',
        what: 'Text the scanner cannot decide (over gradients and images, or too short) reaches its contrast, measured from rendered pixels',
        problems,
        lowest,
      },
    ];
  };

const controls =
  'input:not([type="hidden"]):not([type="file"]), textarea, select, [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [data-slot="select-trigger"]';

interface Edge {
  x: number;
  y: number;
  height: number;
  borderWidth: number;
  borderColor: string;
}

/**
 * Contrast of a box's left edge against what lies outside it. The colours outside and inside the edge come from a
 * capture, so a gradient or an image behind the control counts as it shows; the border colour comes from the styles
 * and is laid over the inside colour, since a captured one-pixel border is blurred by anti-aliasing.
 */
async function edgeContrast(page: Page, edge: Edge) {
  const viewport = page.viewportSize();
  const x = Math.floor(edge.x) - 3;
  const y = Math.round(edge.y + edge.height / 2);
  const width = Math.ceil(edge.borderWidth) + 8;
  if (!viewport || x < 0 || y < 0 || y >= viewport.height || x + width > viewport.width) return null;
  const strip = await page.screenshot({ clip: { x, y, width, height: 1 }, animations: 'disabled', caret: 'hide' });
  return page.evaluate(
    async ([base64, borderColor, borderWidth]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, 1).data;
      const outside = [data[0], data[1], data[2]];
      const last = data.length - 4;
      const inside = [data[last], data[last + 1], data[last + 2]];

      context.clearRect(0, 0, 1, 1);
      context.fillStyle = borderColor;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      const alpha = borderWidth > 0 ? a / 255 : 0;
      const border = [r, g, b].map((value, i) => value * alpha + inside[i] * (1 - alpha));

      const luminance = (rgb: number[]) => {
        const [x1, x2, x3] = rgb.map((value) => {
          const s = value / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * x1 + 0.7152 * x2 + 0.0722 * x3;
      };
      const ratio = (one: number[], other: number[]) => {
        const [l1, l2] = [luminance(one), luminance(other)];
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      return Math.max(ratio(border, outside), ratio(inside, outside));
    },
    [strip.toString('base64'), edge.borderColor, edge.borderWidth] as const,
  );
}

/**
 * The edge of form controls against what surrounds them (1.4.11), from rendered pixels, so a gradient or an image
 * behind the control counts as it shows: a border, or a fill that sets the control apart, at 3:1. A control inside a
 * wrapper that draws the edge (an input group) is judged by the wrapper; one with no edge drawn at all is left out,
 * since the criterion asks for contrast of the edge that is there, not for an edge.
 */
export const controlContrast: Check = async (page) => {
  const kinds = new Set<string>();
  const problems: string[] = [];
  let lowest = Number.POSITIVE_INFINITY;

  for (const handle of await page.locator(controls).elementHandles()) {
    const info = await handle.evaluate((node) => {
      const el = node as HTMLElement;
      // A read-only field shows a value; a disabled or hidden one cannot be used
      const usable =
        !!el.offsetParent &&
        !el.closest(':disabled, [readonly], [aria-disabled="true"], [aria-hidden="true"]') &&
        el.clientWidth > 1 &&
        el.clientHeight > 1;
      return {
        usable,
        kind: `${el.tagName}|${el.getAttribute('role') ?? ''}|${el.getAttribute('type') ?? ''}|${el.getAttribute('class') ?? ''}`,
        name: (
          el.getAttribute('aria-label') ||
          el.getAttribute('name') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('role') ||
          el.tagName.toLowerCase()
        ).slice(0, 30),
      };
    });
    if (!info.usable || kinds.has(info.kind)) continue;
    kinds.add(info.kind);
    await handle.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => null);

    // The control itself, then up to two wrappers that may draw its edge
    let best = 1;
    for (let depth = 0; depth < 3 && best < 3; depth++) {
      const edge = await handle.evaluate((node, levels): Edge | null => {
        let el: Element | null = node as Element;
        for (let i = 0; i < levels; i++) el = el?.parentElement ?? null;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          x: rect.x,
          y: rect.y,
          height: rect.height,
          borderWidth: Number.parseFloat(style.borderLeftWidth) || 0,
          borderColor: style.borderLeftColor,
        };
      }, depth);
      const measured = edge ? await edgeContrast(page, edge) : null;
      if (measured !== null) best = Math.max(best, measured);
    }
    if (best < 1.05) continue;
    best = Math.round(best * 100) / 100;
    lowest = Math.min(lowest, best);
    if (best < 3) problems.push(`${info.name}: ${best}:1`);
  }

  if (lowest === Number.POSITIVE_INFINITY) return [];
  return [
    {
      criteria: ['1.4.11'],
      check: 'probe:control-contrast',
      what: 'The edge of form controls (fields, selects, checkboxes, radios, switches) reaches 3:1 against what surrounds it',
      problems,
      lowest,
    },
  ];
};
