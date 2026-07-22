import { describe, expect, it } from 'vitest';
import { parseSeqCursor } from './seq-cursor';

describe('parseSeqCursor', () => {
  it('parses the bounded form only; the historical open-ended form is rejected', () => {
    expect(parseSeqCursor('51,150')).toEqual({ gte: 51, lte: 150 });
    expect(parseSeqCursor('51')).toBeUndefined();
    expect(parseSeqCursor('')).toBeUndefined();
    expect(parseSeqCursor('a,b')).toBeUndefined();
    expect(parseSeqCursor('1,2,3')).toBeUndefined();
  });
});
