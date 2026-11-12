import { describe, expect, it } from 'vitest';
import { isStructuredText } from '~/modules/common/blocknote/helpers/pasted-text';

describe('pasted text that becomes a file', () => {
  it.each([
    ['{ "steps": [1, 2] }', true],
    ['  [{ "n": 1 }]\n', true],
    ['{}', false],
    ['[]', false],
    ['[x] buy milk', false],
    ['{ not json }', false],
    ['"a string"', false],
    ['42', false],
    ['plain words', false],
  ])('structured data %j: %s', (text, structured) => {
    expect(isStructuredText(text)).toBe(structured);
  });
});
