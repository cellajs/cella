import { appConfig } from 'shared';
import { uploadTemplates } from 'shared/transloadit-config';
import { isPublicUploadTemplate } from 'shared/utils/upload-visibility';
import { describe, expect, it } from 'vitest';

type Step = { use?: string | readonly string[]; robot?: string; format?: string };

/**
 * The format an exported step writes: an image resize re-encodes to its own `format`, or to the format of the image it
 * resizes. Null when the output can be the upload as sent (`:original`, a filter pass-through, any other robot).
 */
const reencodedFormat = (steps: Record<string, Step>, name: string): string | null => {
  const step = steps[name];
  if (name === ':original' || !step || step.robot !== '/image/resize') return null;
  if (step.format) return step.format;
  return typeof step.use === 'string' ? reencodedFormat(steps, step.use) : null;
};

const rasterFormat = /^(?:webp|png|jpg)$/;

describe('upload templates', () => {
  it('must not store an upload as sent (HTML, SVG) public via a public template', () => {
    for (const templateId of appConfig.uploadTemplateIds) {
      if (!isPublicUploadTemplate(templateId)) continue;
      const { steps, use } = uploadTemplates[templateId];
      for (const exported of use) {
        expect(reencodedFormat(steps, exported), `${templateId} exports ${exported}`).toMatch(rasterFormat);
      }
    }
  });

  it('tells a re-encoded image from an upload as sent (positive control)', () => {
    const steps: Record<string, Step> = {
      converted: { use: ':original', robot: '/image/resize', format: 'webp' },
      thumbnail: { use: 'converted', robot: '/image/resize' },
      images: { use: ':original', robot: '/file/filter' },
      resizedFilter: { use: 'images', robot: '/image/resize' },
    };
    expect(reencodedFormat(steps, 'thumbnail')).toBe('webp');
    expect(reencodedFormat(steps, ':original')).toBeNull();
    expect(reencodedFormat(steps, 'images')).toBeNull();
    expect(reencodedFormat(steps, 'resizedFilter')).toBeNull();
  });
});
