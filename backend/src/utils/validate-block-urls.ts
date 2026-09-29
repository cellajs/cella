import type { EntityType } from 'shared';
import type { MediaRefContext } from 'shared/utils/media-ref';
import { validateBlockMediaUrls as validateUrls } from 'shared/utils/validate-block-media-urls';
import { AppError } from '#/core/error';

type ValidationResult = { valid: true } | { valid: false; invalidUrls: string[] };

/**
 * Checks the media blocks of a stored document (blocks as a JSON string) against the media grammar.
 * @param ctx - the document's organization, whose upload prefix storage keys must lie under.
 */
export const validateBlockMediaUrls = (blocksJson: string, ctx: MediaRefContext): ValidationResult => {
  let blocks: unknown;

  try {
    blocks = JSON.parse(blocksJson);
  } catch {
    return { valid: false, invalidUrls: ['[malformed JSON]'] };
  }

  if (!Array.isArray(blocks)) {
    return { valid: false, invalidUrls: ['[invalid block structure]'] };
  }

  return validateUrls(blocks, ctx);
};

/**
 * Refuses (400) a document whose media blocks reference anything but an attachment id, a storage key under
 * `organizationId` or a re-hosted asset.
 */
export const assertBlockMediaUrls = (
  blocksJson: string,
  organizationId: string,
  entityType: EntityType,
  fieldName: string,
) => {
  const result = validateBlockMediaUrls(blocksJson, { organizationId });
  if (!result.valid) {
    throw new AppError(400, 'invalid_request', 'warn', {
      entityType,
      meta: { reason: `Invalid media references in ${fieldName}`, invalidUrls: result.invalidUrls.join(', ') },
    });
  }
};
