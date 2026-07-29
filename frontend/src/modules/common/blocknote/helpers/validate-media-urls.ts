import { hasUntrustedMediaUrls as hasUntrusted } from 'shared/utils/validate-block-media-urls';
import trustedMediaDomains from '#json/trusted-media-domains.json';

interface BlockLike {
  type: string;
  props?: Record<string, unknown>;
  children?: BlockLike[];
}

/** Checks whether the current value contains untrusted media urls. */
export const hasUntrustedMediaUrls = (blocks: BlockLike[]): boolean => {
  return hasUntrusted(blocks, trustedMediaDomains);
};
