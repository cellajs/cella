import 'fake-indexeddb/auto';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sdk', () => ({ getUploadToken: vi.fn(async () => ({ params: null, signature: null })) }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { error: toastError, info: vi.fn() }, toastOffline: vi.fn() }));

import { attachmentsDb } from '~/modules/attachment/offline/attachments-db';
import { createUppy } from '~/modules/common/uploader/helpers/uppy-helpers';
import { bindLocalUserDb } from '~/query/local-user-db';

bindLocalUserDb('test-user');

describe('a public image without cloud storage', () => {
  afterEach(async () => {
    toastError.mockClear();
    await attachmentsDb.blobs.clear();
  });

  it.each([
    ['a cover', { templateId: 'cover', organizationId: 'org-1' }],
    ['an avatar', { templateId: 'avatar' }],
  ] as const)('of %s is refused with a toast, and nothing is stored on this device', async (_, tokenQuery) => {
    const uppy = await createUppy({ restrictions: appConfig.uppy.defaultRestrictions }, tokenQuery);
    const completed = vi.fn();
    uppy.on('transloadit:complete', completed);

    uppy.addFiles([{ name: 'image.png', type: 'image/png', data: new Blob(['png'], { type: 'image/png' }) }]);

    expect(uppy.getFiles()).toEqual([]);
    expect(toastError).toHaveBeenCalledOnce();
    expect(completed).not.toHaveBeenCalled();
    expect(await attachmentsDb.blobs.count()).toBe(0);
  });
});
