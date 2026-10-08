import { describe, expect, it } from 'vitest';
import { counterFindings, type PipelineSnapshot, pipelineFindings, readDirectives } from '../verify';

const scenario = `# SSE fan-out: notify-then-fetch under many live subscribers.
#
# expect: sse.notifications, sync.delta_fetches
# forbid: sse.errors
config:
  target: "x"
`;

describe('scenario directives', () => {
  it('reads the counters a scenario expects and forbids from its header comments', () => {
    expect(readDirectives(scenario)).toEqual({ expect: ['sse.notifications', 'sync.delta_fetches'], forbid: ['sse.errors'] });
    expect(readDirectives('config:\n  target: "x"\n')).toEqual({ expect: [], forbid: [] });
  });

  it('accepts a report that counted what is expected and nothing forbidden', () => {
    expect(counterFindings(scenario, { 'sse.notifications': 510, 'sync.delta_fetches': 16, 'sse.errors': 0 })).toEqual([]);
  });

  it('names an expected counter that stayed at 0 and a forbidden one that counted', () => {
    expect(counterFindings(scenario, { 'sync.delta_fetches': 16, 'sse.errors': 3 })).toEqual([
      'sse.notifications stayed at 0',
      'sse.errors counted 3',
    ]);
  });

  it('asks a short run only for what is forbidden', () => {
    expect(counterFindings(scenario, { 'sse.errors': 3 }, true)).toEqual(['sse.errors counted 3']);
  });
});

describe('pipelineFindings', () => {
  const before: PipelineSnapshot = { activities: 1000, counts: { 'e:c:attachment': 500 } };

  it('accepts a run whose rows the worker all recorded', () => {
    const after = { activities: 1200, counts: { 'e:c:attachment': 500 } };
    const counters = { 'bench.rows_written': 200, 'bench.rows_created.attachment': 100, 'bench.rows_deleted.attachment': 100 };
    expect(pipelineFindings(before, after, counters)).toEqual([]);
  });

  it('reports rows the worker did not record', () => {
    const after = { activities: 1190, counts: { 'e:c:attachment': 500 } };
    expect(pipelineFindings(before, after, { 'bench.rows_written': 200 })).toEqual(['200 rows were written, the CDC worker recorded 190 activities']);
  });

  it('reports an entity count that drifted from the rows created and deleted', () => {
    const after = { activities: 1150, counts: { 'e:c:attachment': 548 } };
    const counters = { 'bench.rows_written': 150, 'bench.rows_created.attachment': 100, 'bench.rows_deleted.attachment': 50 };
    expect(pipelineFindings(before, after, counters)).toEqual(['the attachment count should be 550, the counter says 548']);
  });

  it('leaves a run alone whose processors count no rows', () => {
    expect(pipelineFindings(before, { activities: 1232, counts: {} }, { 'yjs.keystrokes': 80 })).toEqual([]);
  });
});
