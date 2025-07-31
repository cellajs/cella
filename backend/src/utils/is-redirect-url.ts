import { appConfig } from 'config';

/**
 * Validate base url for redirects. Its valid if it starts with the public CDN, private CDN or frontend URL.
 */
export const isRedirectUrl = (url?: string) => {
  if (!url) return false;
  if (url.startsWith(appConfig.publicCDNUrl)) return true;
  if (url.startsWith(appConfig.privateCDNUrl)) return true;
  if (url.startsWith(appConfig.frontendUrl)) return true;
  return false;
};
