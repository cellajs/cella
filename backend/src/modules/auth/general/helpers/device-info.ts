import type { Context } from 'hono';
import { UAParser } from 'ua-parser-js';
import type { Env } from '#/core/context';

/** Extracts device name, type (mobile/desktop), OS, and browser from the User-Agent header. */
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
