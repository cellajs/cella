import { describe, expect, it } from 'vitest';
import { answerStorageMessage, type PlatformStorage } from '~/modules/lti-platform/platform-storage';

// The frame host answers messages from a page another site serves: these are the attacks on it.
describe('answerStorageMessage', () => {
  // Message sources by identity alone: a port stands in for each window.
  const frame = new MessageChannel().port1;
  const otherWindow = new MessageChannel().port1;
  const toolOrigin = 'https://peer-review.example.com';
  const strangerOrigin = 'https://stranger.example.com';

  const scope = (storage: PlatformStorage = new Map()) => ({ frame, ltiToolOrigins: [toolOrigin], storage });
  const put = { subject: 'lti.put_data', message_id: '1', key: 'state_abc', value: 'secret' };
  const get = { subject: 'lti.get_data', message_id: '2', key: 'state_abc' };

  it('ignores a message from any window but the frame, and refuses data to an origin of no page of the LTI tool', () => {
    const storage: PlatformStorage = new Map();
    expect(answerStorageMessage({ data: put, origin: toolOrigin, source: otherWindow }, scope(storage))).toBeNull();
    expect(storage.size).toBe(0);

    const refused = answerStorageMessage({ data: put, origin: strangerOrigin, source: frame }, scope(storage));
    expect(refused).toEqual({
      message: { subject: 'lti.put_data.response', message_id: '1', error: { code: 'wrong_origin', message: expect.any(String) } },
      targetOrigin: strangerOrigin,
    });
    expect(storage.size).toBe(0);
  });

  it('returns a value put to the origin that put it, and to no other', () => {
    const storage: PlatformStorage = new Map();
    expect(answerStorageMessage({ data: put, origin: toolOrigin, source: frame }, scope(storage))?.message).toMatchObject({
      subject: 'lti.put_data.response',
      key: 'state_abc',
      value: 'secret',
    });

    expect(answerStorageMessage({ data: get, origin: toolOrigin, source: frame }, scope(storage))).toEqual({
      message: { subject: 'lti.get_data.response', message_id: '2', key: 'state_abc', value: 'secret' },
      targetOrigin: toolOrigin,
    });

    // A second origin of the LTI tool reads its own values only.
    const otherToolOrigin = 'https://cdn.peer-review.example.com';
    const sibling = { frame, ltiToolOrigins: [toolOrigin, otherToolOrigin], storage };
    expect(answerStorageMessage({ data: get, origin: otherToolOrigin, source: frame }, sibling)?.message).toMatchObject({
      error: { code: 'key_not_found' },
    });
  });
});
