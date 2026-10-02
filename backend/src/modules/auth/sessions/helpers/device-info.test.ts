import { describe, expect, it } from 'vitest';
import { type ClientHints, type DeviceInfo, parseDevice } from '#/modules/auth/sessions/helpers/device-info';

const ua = {
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  chromeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
};

const device = (name: string | null, type: DeviceInfo['type'], os: string | null, browser: string | null): DeviceInfo => ({
  name,
  type,
  os,
  browser,
});

// Real User-Agent strings, current as of 2026. Android UAs since Chrome 110 carry the reduced "Android 10; K".
const userAgents: [string, string | undefined, DeviceInfo][] = [
  ['Chrome on Windows', ua.chromeWindows, device(null, 'desktop', 'Windows', 'Chrome')],
  [
    'Edge on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    device(null, 'desktop', 'Windows', 'Edge'),
  ],
  [
    'Firefox on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
    device(null, 'desktop', 'Windows', 'Firefox'),
  ],
  [
    'Opera on Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 OPR/123.0.0.0',
    device(null, 'desktop', 'Windows', 'Opera'),
  ],
  [
    'Chrome on macOS',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    device('Apple Macintosh', 'desktop', 'macOS', 'Chrome'),
  ],
  [
    'Safari on macOS, also an iPad by default',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    device('Apple Macintosh', 'desktop', 'macOS', 'Safari'),
  ],
  [
    'Firefox on macOS',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
    device('Apple Macintosh', 'desktop', 'macOS', 'Firefox'),
  ],
  ['Chrome on Linux', ua.chromeLinux, device(null, 'desktop', 'Linux', 'Chrome')],
  [
    'Firefox on Ubuntu',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
    device(null, 'desktop', 'Linux', 'Firefox'),
  ],
  [
    'Chrome on ChromeOS',
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    device(null, 'desktop', 'ChromeOS', 'Chrome'),
  ],
  ['Chrome on Android, reduced', ua.chromeAndroid, device(null, 'mobile', 'Android', 'Chrome')],
  [
    'Chrome on an Android tablet',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    device(null, 'desktop', 'Android', 'Chrome'),
  ],
  [
    'Chrome on Android before UA reduction',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36',
    device('Pixel 7', 'mobile', 'Android', 'Chrome'),
  ],
  [
    'Edge on Android',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0.0.0',
    device(null, 'mobile', 'Android', 'Edge'),
  ],
  [
    'Opera on Android',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 OPR/91.0.0.0',
    device(null, 'mobile', 'Android', 'Opera'),
  ],
  [
    'Samsung Internet, reduced',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
    device(null, 'mobile', 'Android', 'Samsung Internet'),
  ],
  [
    'Samsung Internet with a model',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
    device('SM-S918B', 'mobile', 'Android', 'Samsung Internet'),
  ],
  ['Firefox on Android', 'Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0', device(null, 'mobile', 'Android', 'Firefox')],
  [
    'Android WebView',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36',
    device('Pixel 8', 'mobile', 'Android', 'Android WebView'),
  ],
  [
    'Safari on iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    device('Apple iPhone', 'mobile', 'iOS', 'Safari'),
  ],
  [
    'Chrome on iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1',
    device('Apple iPhone', 'mobile', 'iOS', 'Chrome'),
  ],
  [
    'Firefox on iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15',
    device('Apple iPhone', 'mobile', 'iOS', 'Firefox'),
  ],
  [
    'Edge on iPhone',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 EdgiOS/140.0.3485.94 Mobile/15E148 Safari/605.1.15',
    device('Apple iPhone', 'mobile', 'iOS', 'Edge'),
  ],
  [
    'Safari on iPad, mobile site',
    'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    device('Apple iPad', 'desktop', 'iPadOS', 'Safari'),
  ],
  ['curl', 'curl/8.7.1', device(null, 'desktop', null, null)],
  ['no User-Agent', undefined, device(null, 'desktop', null, null)],
];

describe('parseDevice', () => {
  it.each(userAgents)('%s', (_label, userAgent, expected) => {
    expect(parseDevice(userAgent)).toEqual(expected);
  });

  // Chromium sends these three hints by default; values are structured-header strings, quotes included.
  const hinted: [string, string, ClientHints, DeviceInfo][] = [
    [
      'Brave, which sends a Chrome UA',
      ua.chromeWindows,
      { brands: '"Chromium";v="140", "Brave";v="140", "Not=A?Brand";v="24"', mobile: '?0', platform: '"Windows"' },
      device(null, 'desktop', 'Windows', 'Brave'),
    ],
    [
      'Chrome on Android requesting the desktop site',
      ua.chromeLinux,
      { brands: '"Google Chrome";v="140", "Chromium";v="140", "Not=A?Brand";v="24"', mobile: '?0', platform: '"Android"' },
      device(null, 'desktop', 'Android', 'Chrome'),
    ],
    ['the Chrome OS platform name', ua.chromeLinux, { platform: '"Chrome OS"' }, device(null, 'desktop', 'ChromeOS', 'Chrome')],
    ['an Unknown platform', ua.chromeAndroid, { platform: '"Unknown"', mobile: '?1' }, device(null, 'mobile', 'Android', 'Chrome')],
  ];

  it.each(hinted)('prefers client hints: %s', (_label, userAgent, hints, expected) => {
    expect(parseDevice(userAgent, hints)).toEqual(expected);
  });

  it('stores only fixed labels for crafted hints', () => {
    const hints = { brands: 'x'.repeat(100_000), mobile: 'yes', platform: '"constructor"' };
    expect(parseDevice(ua.chromeAndroid, hints)).toEqual(device(null, 'mobile', 'Android', 'Chrome'));
  });

  it('drops a model too long to be real', () => {
    const longModel = `Mozilla/5.0 (Linux; Android 14; ${'A'.repeat(300)}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36`;
    expect(parseDevice(longModel).name).toBeNull();
  });

  it('parses a huge header in bounded time', () => {
    const junk = `Mozilla/5.0 (Linux; Android 1; ${'a Build/'.repeat(20_000)}`;
    const started = performance.now();
    const result = parseDevice(junk);
    expect(performance.now() - started).toBeLessThan(100);
    for (const value of Object.values(result)) expect(String(value).length).toBeLessThanOrEqual(40);
  });
});
