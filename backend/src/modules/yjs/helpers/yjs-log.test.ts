import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { tenantIdLength } from '#/db/utils/constraints';
import { decodeLogNotice, encodeLogNotice, type LogNotice, YJS_LOG_NOTICE_MAX_IDS } from '#/modules/yjs/helpers/yjs-log';

describe('log notices', () => {
  const key = { tenantId: 'tenant-1', entityType: 'attachment', entityId: randomUUID() };

  it('round-trip appended rows and a retirement, as keys only', () => {
    const notices: LogNotice[] = [
      { ...key, logIds: [42] },
      { ...key, logIds: [43, 41, 44] },
      { ...key, retired: true },
    ];
    for (const notice of notices) expect(decodeLogNotice(encodeLogNotice(notice))).toEqual(notice);
    expect(JSON.parse(encodeLogNotice({ ...key, logIds: [42] }))).toEqual({ t: key.tenantId, e: key.entityType, i: key.entityId, id: 42 });
    expect(JSON.parse(encodeLogNotice({ ...key, retired: true }))).toEqual({ t: key.tenantId, e: key.entityType, i: key.entityId, retired: true });
  });

  it('carries the newest of several rows as `id` too, which a release-2 relay reads alone', () => {
    const payload = JSON.parse(encodeLogNotice({ ...key, logIds: [43, 41, 44] }));
    expect(payload).toEqual({ t: key.tenantId, e: key.entityType, i: key.entityId, id: 44, ids: [43, 41, 44] });
  });

  it('stays far below the 8,000-byte limit on a notification, at the longest keys', () => {
    const longestKey = { tenantId: 'x'.repeat(tenantIdLength), entityType: 'x'.repeat(50), entityId: randomUUID() };
    expect(Buffer.byteLength(encodeLogNotice({ ...longestKey, logIds: [Number.MAX_SAFE_INTEGER] }))).toBeLessThan(250);
    const fullest = { ...longestKey, logIds: Array.from({ length: YJS_LOG_NOTICE_MAX_IDS }, (_, n) => Number.MAX_SAFE_INTEGER - n) };
    expect(Buffer.byteLength(encodeLogNotice(fullest))).toBeLessThan(8000);
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
      JSON.stringify({ t, e, i, id: 2, ids: [] }),
      JSON.stringify({ t, e, i, id: 2, ids: [1, 0] }),
      JSON.stringify({ t, e, i, id: 2, ids: [1, '2'] }),
      JSON.stringify({ t, e, i, id: 2, ids: 2 }),
    ];
    for (const payload of payloads) expect(decodeLogNotice(payload), payload).toBeNull();
  });
});
