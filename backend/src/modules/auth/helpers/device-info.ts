import type { Context } from 'hono';
import { UAParser } from 'ua-parser-js';

/**
 * Extracts device, OS, and browser information from the User-Agent header.
 *
 * @param ctx - Request/response context.
 * @returns An object with device name, type (mobile/desktop), OS, and browser info.
 */
export const deviceInfo = (ctx: Context) => {
  const userAgent = ctx.req.header('User-Agent');
  const { device, os, browser } = UAParser(userAgent);

  const getName = () => {
    if (device.model && device.vendor) return `${device.vendor} ${device.model}`;
    return device.model || device.vendor || null;
  };

  const getType = (): 'mobile' | 'desktop' => {
    return device.type === 'wearable' || device.type === 'mobile' ? 'mobile' : 'desktop';
  };
  const getOs = () => (os.name && os.version ? `${os.name} ${os.version}` : os.name || null);

  const getBrowser = () => (browser.name && browser.version ? `${browser.name} ${browser.version}` : browser.name || null);

  return {
    name: getName(),
    type: getType(),
    os: getOs(),
    browser: getBrowser(),
  };
};
