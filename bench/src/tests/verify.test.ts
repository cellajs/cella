import { describe, expect, it } from 'vitest';
import { type PipelineSnapshot, pipelineFindings } from '../verify';

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

  it('leaves a run alone whose scenario counts no rows', () => {
    expect(pipelineFindings(before, { activities: 1232, counts: {} }, { 'yjs.keystrokes': 80 })).toEqual([]);
  });
});
