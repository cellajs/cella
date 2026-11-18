import { describe, expect, it } from 'vitest';
import { answerStorageMessage, type PlatformStorage, storageCapacity } from '~/modules/lti-platform/platform-storage';

// The frame host answers messages from a page another site serves: the storage draft's required behaviours, and the
// attacks on it.
describe('answerStorageMessage', () => {
  // Message sources by identity alone: a port stands in for each window.
  const frame = new MessageChannel().port1;
  const otherWindow = new MessageChannel().port1;
  const toolOrigin = 'https://peer-review.example.com';

  const scope = (storage: PlatformStorage = new Map()) => ({ frame, storage });
  const put = (key: string, value?: string, id = '1') => ({
    subject: 'lti.put_data',
    message_id: id,
    key,
    ...(value === undefined ? {} : { value }),
  });
  const get = (key: string) => ({ subject: 'lti.get_data', message_id: '2', key });
  const send = (storage: PlatformStorage, data: unknown, origin = toolOrigin) =>
    answerStorageMessage({ data, origin, source: frame }, scope(storage));

  it('ignores a message from any window but the frame, and one from an opaque origin no reply can address', () => {
    const storage: PlatformStorage = new Map();
    expect(answerStorageMessage({ data: put('state', 'secret'), origin: toolOrigin, source: otherWindow }, scope(storage))).toBeNull();
    expect(() => send(storage, put('state', 'secret'), 'null')).not.toThrow();
    expect(send(storage, put('state', 'secret'), 'null')).toBeNull();
    expect(storage.size).toBe(0);
  });

  it('keeps values per origin: any origin of the frame stores, and reads its own values alone', () => {
    const storage: PlatformStorage = new Map();
    expect(send(storage, put('state', 'secret'))?.message).toMatchObject({ subject: 'lti.put_data.response', key: 'state', value: 'secret' });
    expect(send(storage, get('state'))).toEqual({
      message: { subject: 'lti.get_data.response', message_id: '2', key: 'state', value: 'secret' },
      targetOrigin: toolOrigin,
    });
    expect(send(storage, get('state'), 'https://stranger.example.com')?.message).toMatchObject({ error: { code: 'key_not_found' } });
  });

  it('clears a key on a put with an omitted or empty value, answered without a value', () => {
    const storage: PlatformStorage = new Map();
    send(storage, put('a', 'one'));
    send(storage, put('b', 'two'));
    expect(send(storage, put('a'))?.message).toEqual({ subject: 'lti.put_data.response', message_id: '1', key: 'a' });
    expect(send(storage, put('b', ''))?.message).toEqual({ subject: 'lti.put_data.response', message_id: '1', key: 'b' });
    expect(send(storage, get('a'))?.message).toMatchObject({ error: { code: 'key_not_found' } });
    expect(send(storage, get('b'))?.message).toMatchObject({ error: { code: 'key_not_found' } });
  });

  it('holds at least 4096 bytes, counted as key plus value length', () => {
    const storage: PlatformStorage = new Map();
    expect(send(storage, put('large', 'x'.repeat(4096 - 'large'.length)), 'https://other.example.com')?.message).not.toHaveProperty('error');
  });

  it('answers storage_exhaustion beyond the limits and drops no other key', () => {
    const storage: PlatformStorage = new Map();
    // The draft's minimum is 500 keys: each of them is accepted, and the first key past the capacity is refused.
    for (let index = 0; index < Math.max(500, storageCapacity.keys); index++) {
      expect(send(storage, put(`k${index}`, 'v'))?.message).not.toHaveProperty('error');
    }
    expect(send(storage, put('one-more', 'v'))?.message).toMatchObject({ error: { code: 'storage_exhaustion' } });
    expect(send(storage, get('k0'))?.message).toMatchObject({ value: 'v' });

    // Overwriting a key at the key limit is no new key.
    expect(send(storage, put('k0', 'w'))?.message).toMatchObject({ value: 'w' });

    const sized: PlatformStorage = new Map();
    send(sized, put('kept', 'v'));
    expect(send(sized, put('big', 'x'.repeat(storageCapacity.bytes)))?.message).toMatchObject({ error: { code: 'storage_exhaustion' } });
    expect(send(sized, get('kept'))?.message).toMatchObject({ value: 'v' });
  });
});
