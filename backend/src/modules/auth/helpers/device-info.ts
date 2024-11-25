import type { Context } from 'hono';
import uaParser from 'ua-parser-js';

// Get device information from user agent
export const deviceInfo = (ctx: Context) => {
  const { device, os, browser } = uaParser(ctx.req.header('User-Agent'));

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
