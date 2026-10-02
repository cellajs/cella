import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { tenantIdLength } from '#/db/utils/constraints';
import { decodeLogNotice, encodeLogNotice, type LogNotice } from '#/modules/yjs/helpers/yjs-log';

describe('log notices', () => {
  const key = { tenantId: 'tenant-1', entityType: 'attachment', entityId: randomUUID() };

  it('round-trip an appended row and a retirement, as keys only', () => {
    const notices: LogNotice[] = [
      { ...key, logId: 42 },
      { ...key, retired: true },
    ];
    for (const notice of notices) expect(decodeLogNotice(encodeLogNotice(notice))).toEqual(notice);
    expect(JSON.parse(encodeLogNotice({ ...key, logId: 42 }))).toEqual({ t: key.tenantId, e: key.entityType, i: key.entityId, id: 42 });
    expect(JSON.parse(encodeLogNotice({ ...key, retired: true }))).toEqual({ t: key.tenantId, e: key.entityType, i: key.entityId, retired: true });
  });

  it('stays far below the 8,000-byte limit on a notification, at the longest keys', () => {
    const longest = { tenantId: 'x'.repeat(tenantIdLength), entityType: 'x'.repeat(50), entityId: randomUUID(), logId: Number.MAX_SAFE_INTEGER };
    expect(Buffer.byteLength(encodeLogNotice(longest))).toBeLessThan(250);
  });

  it('must not throw on a payload it did not write: anything else decodes to null', () => {
    const { tenantId: t, entityType: e, entityId: i } = key;
    const payloads = [
      '',
      'not json',
      'null',
      '42',
      '"text"',
      '[]',
      '{}',
      JSON.stringify({ e, i, id: 1 }),
      JSON.stringify({ t: '', e, i, id: 1 }),
      JSON.stringify({ t: 7, e, i, id: 1 }),
      JSON.stringify({ t, e, i }),
      JSON.stringify({ t, e, i, id: 0 }),
      JSON.stringify({ t, e, i, id: -1 }),
      JSON.stringify({ t, e, i, id: 1.5 }),
      JSON.stringify({ t, e, i, id: '1' }),
      JSON.stringify({ t, e, i, id: 2 ** 53 }),
      JSON.stringify({ t, e, i, retired: 'true' }),
    ];
    for (const payload of payloads) expect(decodeLogNotice(payload), payload).toBeNull();
  });
});
