import type { Context } from 'hono';
import type { Env } from '#/core/context';

export type DeviceInfo = { name: string | null; type: 'mobile' | 'desktop'; os: string | null; browser: string | null };

/** The raw low-entropy client hint headers Chromium browsers send on every HTTPS request: Sec-CH-UA, -Mobile and -Platform. */
export type ClientHints = { brands?: string; mobile?: string; platform?: string };

// First match wins. Edge, Opera and Samsung Internet add their token to a Chrome UA, Chrome's UA ends in "Safari/", and
// every iOS browser is WebKit with a token of its own.
const browserPatterns: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|OPiOS|OPT)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bYaBrowser\//, 'Yandex'],
  [/\bVivaldi\//, 'Vivaldi'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/; wv\)/, 'Android WebView'],
  [/\b(?:CriOS|Chrome|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

// iPhone UAs contain "like Mac OS X" and Android UAs contain "Linux", so the specific patterns come first.
const osPatterns: [RegExp, string][] = [
  [/\b(?:iPhone|iPod)\b/, 'iOS'],
  [/\biPad\b/, 'iPadOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b/, 'macOS'],
  [/\b(?:Linux|X11)\b/, 'Linux'],
];

// Sec-CH-UA lists the browser's own brand next to "Chromium" and a made-up one; Brave is only told apart here.
const hintBrands: [string, string][] = [
  ['Microsoft Edge', 'Edge'],
  ['Opera', 'Opera'],
  ['Brave', 'Brave'],
  ['Samsung Internet', 'Samsung Internet'],
  ['Android WebView', 'Android WebView'],
  ['Google Chrome', 'Chrome'],
];

const hintPlatforms = new Map([
  ['Android', 'Android'],
  ['Chrome OS', 'ChromeOS'],
  ['Chromium OS', 'ChromeOS'],
  ['Linux', 'Linux'],
  ['macOS', 'macOS'],
  ['Windows', 'Windows'],
]);

const firstMatch = (ua: string, patterns: [RegExp, string][]) => patterns.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

/** The model an Android UA names, such as "Pixel 7". Reduced Chrome UAs send "K" in that slot and Firefox "Mobile" or "Tablet". */
const androidModel = (ua: string) => {
  const model = /\bAndroid [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/.exec(ua)?.[1]?.trim();
  if (!model || model.length > 40 || /^(?:K|wv|Mobile|Tablet|rv:.*)$/.test(model)) return null;
  return model;
};

/**
 * Device name, type, OS and browser from a User-Agent string, with client hints taking precedence where sent. Every value
 * but the Android model is a fixed label, and the model is length-capped, so a crafted header stores nothing unexpected.
 * Tablets count as desktop, and an iPad in its default desktop mode reads as a Mac.
 */
export const parseDevice = (userAgent: string | undefined, hints: ClientHints = {}): DeviceInfo => {
  const ua = (userAgent ?? '').slice(0, 500);
  const platform = hints.platform?.trim().replace(/^"|"$/g, '');

  const os = (platform && hintPlatforms.get(platform)) || firstMatch(ua, osPatterns);
  const browser = hintBrands.find(([brand]) => hints.brands?.includes(`"${brand}"`))?.[1] ?? firstMatch(ua, browserPatterns);
  const mobile = hints.mobile === '?1' || (hints.mobile !== '?0' && /\b(?:Mobi|iPhone|iPod)/.test(ua) && !/\b(?:iPad|Tablet)\b/.test(ua));
  const apple = /\b(iPhone|iPad|iPod|Macintosh)\b/.exec(ua)?.[1];

  return { name: apple ? `Apple ${apple}` : androidModel(ua), type: mobile ? 'mobile' : 'desktop', os, browser };
};

/** The requesting device, from its User-Agent header and Chromium's client hints. */
export const deviceInfo = (ctx: Context<Env>) =>
  parseDevice(ctx.req.header('User-Agent'), {
    brands: ctx.req.header('Sec-CH-UA'),
    mobile: ctx.req.header('Sec-CH-UA-Mobile'),
    platform: ctx.req.header('Sec-CH-UA-Platform'),
  });
