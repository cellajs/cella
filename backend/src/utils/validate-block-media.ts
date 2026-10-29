import type { EntityType } from 'shared';
import type { MediaRefContext } from 'shared/utils/media-ref';
import { validateBlockMediaUrls } from 'shared/utils/validate-block-media-urls';
import { AppError } from '#/core/error';

type ValidationResult = ReturnType<typeof validateBlockMediaUrls>;

/** Bracket levels a document may nest, about 60 nested blocks: every walker over the blocks recurses once per level. */
const maxBlockDepth = 128;

/** Whether `json` nests arrays and objects past maxBlockDepth, counting brackets outside strings, before any parse. */
const nestsTooDeep = (json: string): boolean => {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '[' || char === '{') {
      if (++depth > maxBlockDepth) return true;
    } else if (char === ']' || char === '}') depth--;
  }
  return false;
};

/**
 * Checks the media blocks of a stored document (blocks as a JSON string) against the media grammar.
 * @param ctx - the document's organization, whose upload prefix storage keys must lie under.
 */
export const validateBlockMediaJson = (blocksJson: string, ctx: MediaRefContext): ValidationResult => {
  if (nestsTooDeep(blocksJson)) return { valid: false, invalidUrls: ['[nested too deep]'] };

  let blocks: unknown;

  try {
    blocks = JSON.parse(blocksJson);
  } catch {
    return { valid: false, invalidUrls: ['[malformed JSON]'] };
  }

  if (!Array.isArray(blocks)) {
    return { valid: false, invalidUrls: ['[invalid block structure]'] };
  }

  return validateBlockMediaUrls(blocks, ctx);
};

/**
 * Refuses (400) a document whose media blocks reference anything but an attachment id, a storage key under
 * `organizationId` or a re-hosted asset.
 */
export const assertBlockMediaUrls = (blocksJson: string, organizationId: string, entityType: EntityType, fieldName: string) => {
  const result = validateBlockMediaJson(blocksJson, { organizationId });
  if (!result.valid) {
    throw new AppError(400, 'invalid_request', 'warn', {
      entityType,
      meta: { reason: `Invalid media references in ${fieldName}`, invalidUrls: result.invalidUrls.join(', ') },
    });
  }
};
