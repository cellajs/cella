import type { Block } from '@blocknote/core';
import type { EntityType } from 'shared';
import { validateBlockMediaUrls as validateUrls } from 'shared/utils/validate-block-media-urls';
import { AppError } from '#/core/error';
import trustedMediaDomains from '#json/trusted-media-domains.json';

export { trustedMediaDomains };

type ValidationResult = { valid: true } | { valid: false; invalidUrls: string[] };

/** @param extraAllowedDomains - trusted domains beyond `trusted-media-domains.json`, e.g. `['mycompany.com']`. */
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

  const allDomains = extraAllowedDomains ? [...trustedMediaDomains, ...extraAllowedDomains] : trustedMediaDomains;
  return validateUrls(blocks, allDomains);
};

export const assertBlockMediaUrls = (blocksJson: string, entityType: EntityType, fieldName: string) => {
  const result = validateBlockMediaUrls(blocksJson);
  if (!result.valid) {
    throw new AppError(400, 'invalid_request', 'warn', {
      entityType,
      meta: { reason: `Untrusted media URLs in ${fieldName}`, invalidUrls: result.invalidUrls.join(', ') },
    });
  }
};
