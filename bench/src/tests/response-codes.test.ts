import { describe, expect, it } from 'vitest';
import { rejectedResponses } from '../response-codes';

describe('rejectedResponses', () => {
  it('accepts a run whose responses are all 2xx', () => {
    expect(rejectedResponses({ 'http.requests': 45, 'http.codes.200': 40, 'http.codes.204': 5 })).toBeNull();
  });

  it('names the statuses of a run the stack rejected', () => {
    expect(rejectedResponses({ 'http.requests': 20, 'http.codes.401': 20 })).toBe('20 of 20 responses were not 2xx (401 ×20)');
  });

  it('counts the fetches a processor makes itself', () => {
    const counters = { 'http.codes.200': 20, 'fetch.codes.401': 9, 'fetch.codes.500': 1 };
    expect(rejectedResponses(counters)).toBe('10 of 30 responses were not 2xx (401 ×9, 500 ×1)');
  });

  it('tolerates up to 1% of failures under load', () => {
    expect(rejectedResponses({ 'http.codes.200': 9900, 'http.codes.503': 100 })).toBeNull();
    expect(rejectedResponses({ 'http.codes.200': 9899, 'http.codes.503': 101 })).toBe('101 of 10000 responses were not 2xx (503 ×101)');
  });

  it('accepts a run without HTTP responses', () => {
    expect(rejectedResponses({ 'vusers.created': 1, 'yjs.keystrokes': 80 })).toBeNull();
  });
});
