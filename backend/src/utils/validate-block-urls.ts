import type { Block } from '@blocknote/core';
import { isCDNUrl } from 'shared/is-cdn-url';
import trustedMediaDomains from '#json/trusted-media-domains.json';

export { trustedMediaDomains };

/** Block types that auto-load external resources (images, videos, etc.) */
const mediaBlockTypes = new Set(['image', 'video', 'audio', 'file']);

/**
 * Checks if a URL's hostname matches or is a subdomain of any trusted domain.
 * E.g., 'i.ytimg.com' matches 'ytimg.com', 'www.youtube.com' matches 'youtube.com'.
 */
const isAllowedDomain = (url: string, domains: string[]): boolean => {
  try {
    const { hostname } = new URL(url);
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

/**
 * Recursively collects all media URLs from BlockNote blocks.
 * Only checks `props.url` on media block types (image, video, audio, file),
 * since these auto-load external resources. Regular links (href) are user-clicked
 * and intentionally excluded.
 */
const collectMediaUrls = (blocks: Block[]): string[] => {
  const urls: string[] = [];

  for (const block of blocks) {
    // Check media block props.url
    if (mediaBlockTypes.has(block.type) && block.props && 'url' in block.props) {
      const url = block.props.url;
      if (typeof url === 'string' && url.length > 0) {
        urls.push(url);
      }
    }

    // Recurse into children
    if (Array.isArray(block.children)) {
      urls.push(...collectMediaUrls(block.children));
    }
  }

  return urls;
};

type ValidationResult = { valid: true } | { valid: false; invalidUrls: string[] };

/**
 * Validates that all media URLs in BlockNote JSON content are from trusted sources.
 * A URL is trusted if it matches any of:
 * 1. The app's own CDN URLs (via isCDNUrl)
 * 2. The default trusted media domains allowlist (YouTube, Vimeo, Imgur, etc.)
 * 3. Any extra allowed domains passed by the caller
 *
 * Only validates media blocks (image, video, audio, file) that auto-load resources.
 * Inline links (href) are intentionally not checked since they require user clicks.
 *
 * @param blocksJson - Serialized BlockNote JSON string
 * @param extraAllowedDomains - Optional additional trusted domains (e.g., ['mycompany.com'])
 * @returns Validation result with invalid URLs if any are found
 */
export const validateBlockMediaUrls = (blocksJson: string, extraAllowedDomains?: string[]): ValidationResult => {
  let blocks: Block[];

  try {
    blocks = JSON.parse(blocksJson) as Block[];
  } catch {
    return { valid: false, invalidUrls: ['[malformed JSON]'] };
  }

  if (!Array.isArray(blocks)) {
    return { valid: false, invalidUrls: ['[invalid block structure]'] };
  }

  const urls = collectMediaUrls(blocks);
  if (urls.length === 0) return { valid: true };

  // Combine default trusted domains with any extra allowed domains
  const allDomains = extraAllowedDomains ? [...trustedMediaDomains, ...extraAllowedDomains] : trustedMediaDomains;

  const invalidUrls = urls.filter((url) => {
    // Check app CDN URLs first (fastest path)
    if (isCDNUrl(url)) return false;

    // Check against trusted media domains allowlist
    if (isAllowedDomain(url, allDomains)) return false;

    return true;
  });

  return invalidUrls.length === 0 ? { valid: true } : { valid: false, invalidUrls };
};
