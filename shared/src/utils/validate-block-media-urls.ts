import { appConfig } from '../config-builder/app-config';
import { isCDNUrl } from './is-cdn-url';

/** Block types that auto-load external resources */
const mediaBlockTypes = new Set(['image', 'video', 'audio', 'file']);

const isAllowedDomain = (url: string, domains: string[]): boolean => {
  try {
    const { hostname } = new URL(url);
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

const isObjectStorageHost = (hostname: string): boolean => {
  const storageHost = appConfig.s3.host;
  if (!storageHost) return false;
  return hostname === storageHost || hostname.endsWith(`.${storageHost}`);
};

const isTrustedMediaReference = (value: string, trustedDomains: string[]): boolean => {
  // Internal keys/IDs (non-URL strings) are trusted and resolved by app logic.
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return true;
  }

  // Allow only HTTP(S) absolute URLs from trusted hosts.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (isCDNUrl(value)) return true;
  if (isObjectStorageHost(parsed.hostname)) return true;
  if (isAllowedDomain(value, trustedDomains)) return true;

  return false;
};

interface BlockLike {
  type: string;
  props?: Record<string, unknown>;
  children?: BlockLike[];
}

const collectMediaUrls = (blocks: BlockLike[]): string[] => {
  const urls: string[] = [];

  for (const block of blocks) {
    if (mediaBlockTypes.has(block.type) && block.props && 'url' in block.props) {
      const url = block.props.url;
      if (typeof url === 'string' && url.length > 0) {
        urls.push(url);
      }
    }

    if (Array.isArray(block.children)) {
      urls.push(...collectMediaUrls(block.children));
    }
  }

  return urls;
};

type ValidationResult = { valid: true } | { valid: false; invalidUrls: string[] };

/**
 * Validates that all media URLs in BlockNote blocks are from trusted sources.
 * Only checks media blocks (image, video, audio, file) that auto-load resources.
 * Inline links (href) are intentionally not checked since they require user clicks.
 */
export const validateBlockMediaUrls = (blocks: BlockLike[], trustedDomains: string[]): ValidationResult => {
  const urls = collectMediaUrls(blocks);
  if (urls.length === 0) return { valid: true };

  const invalidUrls = urls.filter((url) => !isTrustedMediaReference(url, trustedDomains));

  return invalidUrls.length === 0 ? { valid: true } : { valid: false, invalidUrls };
};

/**
 * Checks BlockNote blocks for untrusted media URLs.
 * Returns true if any media URLs are from untrusted sources.
 */
export const hasUntrustedMediaUrls = (blocks: BlockLike[], trustedDomains: string[]): boolean => {
  return !validateBlockMediaUrls(blocks, trustedDomains).valid;
};
