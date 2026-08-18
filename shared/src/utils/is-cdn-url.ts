import { appConfig } from '../config-builder/app-config.ts';

/** True when the URL starts with the public or private CDN URL. */
export const isCDNUrl = (url?: string) => {
  if (!url) return false;
  if (url.startsWith(appConfig.s3.publicCDNUrl)) return true;
  if (url.startsWith(appConfig.s3.privateCDNUrl)) return true;
  return false;
};
