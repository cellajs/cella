import { appConfig } from 'shared';

/**
 * Validate if a URL is a CDN URL. Its valid if it starts with the public CDN or private CDN URL.
 */
export const isCDNUrl = (url?: string) => {
  if (!url) return false;
  if (appConfig.s3.publicCDNUrl && url.startsWith(appConfig.s3.publicCDNUrl)) return true;
  if (appConfig.s3.privateCDNUrl && url.startsWith(appConfig.s3.privateCDNUrl)) return true;
  return false;
};
