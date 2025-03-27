import { config } from 'config';

/**
 * Validate if a URL is a CDN URL. Its valid if it starts with the public CDN or private CDN URL.
 */
export const isCDNUrl = (url?: string) => {
  if (!url) return false;
  if (url.startsWith(config.publicCDNUrl)) return true;
  if (url.startsWith(config.privateCDNUrl)) return true;
  return false;
};
