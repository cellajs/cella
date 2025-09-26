import type { Context } from 'hono';
import { UAParser } from 'ua-parser-js';
import type { Env } from '#/lib/context';

/**
 * Extracts device, OS, and browser information from the User-Agent header.
 *
 * @param ctx - Request/response context.
 * @returns An object with device name, type (mobile/desktop), OS, and browser info.
 */
export const deviceInfo = (ctx: Context<Env>) => {
  const userAgent = ctx.req.header('User-Agent');
  const { device, os, browser } = UAParser(userAgent);

  const getName = () => {
    if (device.model && device.vendor) return `${device.vendor} ${device.model}`;
    return device.model || device.vendor || null;
  };

  const getType = (): 'mobile' | 'desktop' => {
    return device.type === 'wearable' || device.type === 'mobile' ? 'mobile' : 'desktop';
  };

  return {
    name: getName(),
    type: getType(),
    os: os.name || null,
    browser: browser.name || null,
  };
};
