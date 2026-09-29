import { appConfig } from '../config-builder/app-config.ts';
import { isOriginIn } from './url-origin.ts';

/** True when `url` sits on the CDN base `base`: the exact parsed origin, and below the base path when it has one. */
const isUnderBase = (url: string, base: string) => {
  if (!isOriginIn(url, [base])) return false;
  const basePath = new URL(base).pathname.replace(/\/$/, '');
  return basePath === '' || new URL(url).pathname.startsWith(`${basePath}/`);
};

/** True when the URL points into the public or private CDN. */
export const isCDNUrl = (url?: string) => {
  if (!url) return false;
  return [appConfig.s3.publicCDNUrl, appConfig.s3.privateCDNUrl].some((base) => isUnderBase(url, base));
};
