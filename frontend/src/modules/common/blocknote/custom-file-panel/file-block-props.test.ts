import { parseMediaRef } from 'shared/utils/media-ref';
import { systemUploadPrefix } from 'shared/utils/upload-visibility';
import { describe, expect, it } from 'vitest';
import { storedFileBlockProps } from '~/modules/common/blocknote/custom-file-panel/file-block-props';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';

const storedImage = {
  url: '/system/admin-1/f1.photo.jpg',
  original_name: 'photo.png',
  user_meta: { attachmentId: 'm-1' },
};
// Test mock: an assembly result carries many more fields; the helper reads only these.
const results = { image: [storedImage as unknown as UploadedUppyFile<'newsletter'>['image'][number]] };

describe('newsletter image blocks', () => {
  it('reference the stored key of the re-encoded image, which renders in a system document (positive control)', () => {
    const [props] = storedFileBlockProps(results, 'newsletter');
    expect(props).toEqual({ name: 'photo.png', url: storedImage.url, measuredId: 'm-1' });
    expect(parseMediaRef(props.url, { organizationId: systemUploadPrefix }).kind).toBe('orgKey');
  });

  it('must not render a system upload via an organization document', () => {
    const organizationId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
    expect(parseMediaRef(storedImage.url, { organizationId }).kind).toBe('invalid');
  });
});
