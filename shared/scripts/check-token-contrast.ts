/**
 * Contrast of the color tokens in the theme stylesheet, in light and dark mode: text on its own fill, the status
 * colors as text on the page, and `--edge-raised`, the control edge increased contrast paints and the audit measures.
 * A token below WCAG's ratio fails here, before any page is opened.
 */
import { type Finding, lineColumn } from './repo-files.ts';

const themeFile = 'frontend/src/styling/tailwind.css';

/** Fills that carry their `-foreground` text. */
const fills = ['background', 'card', 'popover', 'primary', 'secondary', 'muted', 'accent', 'destructive', 'success', 'warning', 'brand'];
/** Tokens also used as text on the page and on a card. */
const textTokens = ['destructive', 'success', 'warning'];
const surfaces = ['background', 'card'];

type Oklch = [lightness: number, chroma: number, hue: number];

/** `--name: oklch(L C H)` declarations of the first block that follows `selector` inside the theme layer. */
function tokens(source: string, selector: string): Map<string, { value: Oklch; offset: number }> {
  const found = new Map<string, { value: Oklch; offset: number }>();
  const start = source.search(new RegExp(`^\\s*${selector.replace('.', '\\.')}\\s*\\{\\s*\\n\\s*--background:`, 'm'));
  if (start < 0) return found;
  const block = source.slice(start, source.indexOf('\n  }', start));
  for (const match of block.matchAll(/--([a-z-]+):\s*oklch\(([\d.]+)%?\s+([\d.]+)\s+([\d.]+)\)/g)) {
    const lightness = Number(match[2]);
    found.set(match[1], {
      value: [lightness > 1 ? lightness / 100 : lightness, Number(match[3]), Number(match[4])],
      offset: start + (match.index ?? 0),
    });
  }
  return found;
}

/** Relative luminance of an oklch color, clipped to sRGB. */
function luminance([lightness, chroma, hue]: Oklch): number {
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const [red, green, blue] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((value) => Math.min(1, Math.max(0, value)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

const ratio = (one: Oklch, other: Oklch) => {
  const [x, y] = [luminance(one), luminance(other)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Findings for token pairs below their ratio. A token the dark block leaves out keeps its light value there. */
export function tokenContrastFindings(file: string, source: string): Finding[] {
  if (file !== themeFile) return [];
  const light = tokens(source, ':root');
  const dark = new Map([...light, ...tokens(source, '.dark')]);
  const findings: Finding[] = [];

  for (const [mode, set] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    const check = (text: string, behind: string, needed: number, what: string) => {
      const [front, back] = [set.get(text), set.get(behind)];
      if (!front || !back) return;
      const measured = ratio(front.value, back.value);
      if (measured >= needed) return;
      findings.push({
        file,
        ...lineColumn(source, front.offset),
        rule: 'token-contrast',
        term: `--${text}`,
        message: `${what} is ${measured.toFixed(2)}:1 in ${mode} mode, below ${needed}:1 (--${text} on --${behind})`,
      });
    };
    for (const fill of fills) check(fill === 'background' ? 'foreground' : `${fill}-foreground`, fill, 4.5, 'text on its fill');
    for (const token of textTokens) for (const surface of surfaces) check(token, surface, 4.5, 'status color as text');
    for (const surface of surfaces) check('edge-raised', surface, 3, 'raised control edge');

    // A theme that drops the token has nothing to measure, which would pass every check above in silence
    const anchor = set.get('background');
    if (anchor && !set.get('edge-raised')) {
      findings.push({
        file,
        ...lineColumn(source, anchor.offset),
        rule: 'token-contrast',
        term: '--edge-raised',
        message: `no --edge-raised in ${mode} mode: increased contrast has no value to paint, and the 3:1 edge goes unchecked`,
      });
    }
  }
  return findings;
}
