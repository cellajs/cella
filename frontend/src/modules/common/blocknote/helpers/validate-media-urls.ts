import { hasUntrustedMediaUrls as hasUntrusted } from 'shared/validate-block-media-urls';
import trustedMediaDomains from '#json/trusted-media-domains.json';

interface BlockLike {
  type: string;
  props?: Record<string, unknown>;
  children?: BlockLike[];
}

export const hasUntrustedMediaUrls = (blocks: BlockLike[]): boolean => {
  return hasUntrusted(blocks, trustedMediaDomains);
};
