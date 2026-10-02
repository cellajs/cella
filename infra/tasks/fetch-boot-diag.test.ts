import { describe, expect, it, vi } from 'vitest';
import {
  bundleRelease,
  type DiagReader,
  emptyBootDiagGuidance,
  findReleaseBundles,
  isEmptyPrefixLs,
  parseArgs,
  parseKeys,
  renderDiagnostics,
  renderReleaseDiagnostics,
  selectDiagnostics,
  summarizeBundles,
} from './fetch-boot-diag';

// A realistic `aws s3 ls` block: `<date> <time> <size> <key>`.
const LS = `
2026-05-31 09:00:01        12 backend-stage-1-pull
2026-05-31 09:00:05        34 backend-stage-2-up
2026-05-31 09:00:09        56 backend-20260531T090009-boot.log
2026-05-31 09:00:11        78 frontend-stage-1-pull
                           PRE nested/
`;

describe('parseKeys', () => {
  it('extracts the 4th column as the object key', () => {
    expect(parseKeys(LS)).toEqual(['backend-stage-1-pull', 'backend-stage-2-up', 'backend-20260531T090009-boot.log', 'frontend-stage-1-pull']);
  });

  it('ignores blank lines and PRE directory rows', () => {
    expect(parseKeys('\n   \n')).toEqual([]);
    // Real `aws s3 ls` PRE rows carry no date/time/size columns.
    expect(parseKeys('                           PRE dir/')).toEqual([]);
  });
});

describe('selectDiagnostics', () => {
  const keys = [
    'backend-stage-1-pull',
    'backend-stage-2-up',
    'backend-20260531T090009-boot.log',
    'backend-20260531T090509-boot.log',
    'frontend-stage-1-pull',
  ];

  it('scopes markers, stage details and the latest full log to the service', () => {
    const sel = selectDiagnostics(keys, 'backend');
    expect(sel.markers).toEqual([
      'backend-20260531T090009-boot.log',
      'backend-20260531T090509-boot.log',
      'backend-stage-1-pull',
      'backend-stage-2-up',
    ]);
    expect(sel.stageDetailKeys).toEqual(['backend-stage-1-pull', 'backend-stage-2-up']);
    expect(sel.latestFull).toBe('backend-20260531T090509-boot.log');
  });

  it('does not bleed across services', () => {
    const sel = selectDiagnostics(keys, 'frontend');
    expect(sel.stageDetailKeys).toEqual(['frontend-stage-1-pull']);
    expect(sel.latestFull).toBeUndefined();
  });

  it('reports no full log when none was uploaded', () => {
    const sel = selectDiagnostics(['backend-stage-1-pull'], 'backend');
    expect(sel.latestFull).toBeUndefined();
  });

  it('prefers the boot transcript over the sibling events bundle', () => {
    const sel = selectDiagnostics(['backend-20260807T081154Z-boot.log', 'backend-20260807T081154Z-events.jsonl'], 'backend');
    expect(sel.latestFull).toBe('backend-20260807T081154Z-boot.log');
  });

  it('caps stage details at the 10 most recent', () => {
    const many = Array.from({ length: 15 }, (_, i) => `backend-stage-${String(i).padStart(2, '0')}-x`);
    const sel = selectDiagnostics(many, 'backend');
    expect(sel.stageDetailKeys).toHaveLength(10);
    expect(sel.stageDetailKeys.at(-1)).toBe('backend-stage-14-x');
  });

  it('treats regex metacharacters in the service name literally', () => {
    // A hostile/oddly-named service must not be interpreted as a pattern.
    const sel = selectDiagnostics(['a.b-stage-1', 'axb-stage-1'], 'a.b');
    expect(sel.stageDetailKeys).toEqual(['a.b-stage-1']);
  });

  it('captures reconciler failure logs (failed + pull-failed + migrate-failed) separately', () => {
    const keys = [
      'backend-stage-1-pull',
      'backend-failed-20260602T093000Z.log',
      'backend-pull-failed-20260602T094500Z.log',
      'backend-migrate-failed-20260602T095000Z.log',
    ];
    const sel = selectDiagnostics(keys, 'backend');
    expect(sel.failureKeys).toEqual([
      'backend-failed-20260602T093000Z.log',
      'backend-migrate-failed-20260602T095000Z.log',
      'backend-pull-failed-20260602T094500Z.log',
    ]);
    // failure captures are NOT misclassified as boot markers/full logs
    expect(sel.markers).toEqual(['backend-stage-1-pull']);
    expect(sel.latestFull).toBeUndefined();
  });
});

describe('renderDiagnostics', () => {
  it('prints markers, each stage body and the latest full log', () => {
    const logs: string[] = [];
    const reader: DiagReader = { list: () => '', cat: (key) => `BODY(${key})` };
    const sel = {
      markers: ['backend-stage-1-pull'],
      stageDetailKeys: ['backend-stage-1-pull'],
      latestFull: 'backend-20260531T090509-boot.log',
      failureKeys: [],
    };

    renderDiagnostics('backend', sel, reader, (m) => logs.push(m));

    expect(logs).toContain('::group::Stage markers (backend-*)');
    expect(logs).toContain('backend-stage-1-pull');
    expect(logs).toContain('BODY(backend-stage-1-pull)');
    expect(logs).toContain('BODY(backend-20260531T090509-boot.log)');
  });

  it('warns when there is no full boot-diag log but markers exist', () => {
    const logs: string[] = [];
    const cat = vi.fn((key: string) => `BODY(${key})`);
    renderDiagnostics(
      'cdc',
      { markers: ['cdc-stage-1-pull'], stageDetailKeys: ['cdc-stage-1-pull'], latestFull: undefined, failureKeys: [] },
      { list: () => '', cat },
      (m) => logs.push(m),
    );

    expect(logs).toContain('::warning::No cdc full boot-diag log uploaded');
  });

  it('prints a single no-diagnostics line for a service that owns nothing', () => {
    const logs: string[] = [];
    const cat = vi.fn(() => '');
    renderDiagnostics('cdc', { markers: [], stageDetailKeys: [], latestFull: undefined, failureKeys: [] }, { list: () => '', cat }, (m) =>
      logs.push(m),
    );

    expect(logs).toEqual(['::warning::No boot diagnostics for cdc: nothing was ever uploaded for this service']);
    expect(cat).not.toHaveBeenCalled();
  });

  it('prints reconciler failure captures before the boot transcript', () => {
    const logs: string[] = [];
    const reader: DiagReader = { list: () => '', cat: (key) => `BODY(${key})` };
    const sel = { markers: [], stageDetailKeys: [], latestFull: undefined, failureKeys: ['backend-pull-failed-20260602T094500Z.log'] };

    renderDiagnostics('backend', sel, reader, (m) => logs.push(m));

    expect(logs).toContain('::group::⚠️ backend-pull-failed-20260602T094500Z.log');
    expect(logs).toContain('BODY(backend-pull-failed-20260602T094500Z.log)');
    // failure group is emitted before the stage-markers group
    const failIdx = logs.indexOf('::group::⚠️ backend-pull-failed-20260602T094500Z.log');
    const markerIdx = logs.indexOf('::group::Stage markers (backend-*)');
    expect(failIdx).toBeLessThan(markerIdx);
  });

  it('renders plain headers (no ::group:: markup) in plain style', () => {
    const logs: string[] = [];
    const reader: DiagReader = { list: () => '', cat: (key) => `BODY(${key})` };
    const sel = {
      markers: ['backend-stage-1-pull'],
      stageDetailKeys: ['backend-stage-1-pull'],
      latestFull: 'backend-20260531T090509-boot.log',
      failureKeys: [],
    };

    renderDiagnostics('backend', sel, reader, (m) => logs.push(m), 'plain');

    expect(logs.some((l) => l.includes('::group::') || l.includes('::endgroup::'))).toBe(false);
    expect(logs).toContain('\n=== Stage markers (backend-*) ===');
    expect(logs).toContain('BODY(backend-20260531T090509-boot.log)');
  });

  it('warns with a plain prefix when no full log exists in plain style', () => {
    const logs: string[] = [];
    renderDiagnostics(
      'cdc',
      { markers: ['cdc-stage-1-pull'], stageDetailKeys: [], latestFull: undefined, failureKeys: [] },
      { list: () => '', cat: () => '' },
      (m) => logs.push(m),
      'plain',
    );
    expect(logs).toContain('! No cdc full boot-diag log uploaded');
  });

  it('annotates inline when reading a single object fails, without aborting', () => {
    const logs: string[] = [];
    const reader: DiagReader = {
      list: () => '',
      cat: (key) => {
        if (key.includes('boot.log')) throw new Error('NoSuchKey');
        return `BODY(${key})`;
      },
    };
    const sel = { markers: [], stageDetailKeys: ['backend-stage-1-pull'], latestFull: 'backend-20260531T090509-boot.log', failureKeys: [] };

    renderDiagnostics('backend', sel, reader, (m) => logs.push(m), 'plain');

    // The good object still renders and the failing one is annotated, not thrown.
    expect(logs).toContain('BODY(backend-stage-1-pull)');
    expect(logs.some((l) => l.includes('<<failed to read backend-20260531T090509-boot.log: NoSuchKey>>'))).toBe(true);
  });
});

describe('release-scoped bundles', () => {
  const previous = 'e9a8d485e2481f5e6329e1671bba88e57d60b44d';
  const deploying = '84b7e22373e6a4720e6fd6c58e1aba647784084a';
  const body = (release: string, rc = 0) => `service=backend\nrelease=${release}\nboot_rc=${rc}\n\nboot log not found\n`;
  /** The 0.13.0 bucket: older releases' transcripts, their events and failure captures, nothing from the deploying release. */
  const bodies: Record<string, string> = {
    'backend-20260925T142538Z-boot.log': body('aaaa111'),
    'backend-20260929T211437Z-boot.log': body(previous),
    'backend-20260929T211437Z-events.jsonl': '{}',
    'backend-failed-20260923T213658Z.log': body('bbbb222', 1),
  };
  const reader = (extra: Record<string, string> = {}): DiagReader & { reads: string[] } => {
    const all = { ...bodies, ...extra };
    const reads: string[] = [];
    return {
      reads,
      list: () => '',
      cat: (key) => {
        reads.push(key);
        const found = all[key];
        if (found === undefined) throw new Error(`NoSuchKey ${key}`);
        return found;
      },
    };
  };

  it('reads the release from a bundle header', () => {
    expect(bundleRelease(body(previous))).toBe(previous);
    expect(bundleRelease('no header')).toBeUndefined();
  });

  it('finds no bundle for a release whose boot runner never uploaded, and names the newest other one', () => {
    const found = findReleaseBundles(Object.keys(bodies), 'backend', deploying, reader());
    expect(found.matches).toEqual([]);
    expect(found.newestOther).toEqual({ key: 'backend-20260929T211437Z-boot.log', release: previous });
  });

  it('must not print an older release’s bundle as if it were the deploying one', () => {
    const logs: string[] = [];
    const found = findReleaseBundles(Object.keys(bodies), 'backend', deploying, reader());
    renderReleaseDiagnostics('backend', deploying, found, (line) => logs.push(line));
    expect(logs[0]).toBe(
      '::warning::backend: no boot bundle for 84b7e22: its boot runner has not finished (still running, stuck before its upload, or never started)',
    );
    expect(logs.join('\n')).not.toContain(`release=${previous}`);
    expect(logs.join('\n')).toContain('from release e9a8d48: not shown');
  });

  it('prints the deploying release’s newest bundle, flagged when its boot failed, and accepts an abbreviated SHA', () => {
    const extra = { 'backend-20261002T075610Z-boot.log': `${body(deploying, 1)}failed_phase=release-command\n` };
    const r = reader(extra);
    const found = findReleaseBundles([...Object.keys(bodies), ...Object.keys(extra)], 'backend', '84b7e22', r);
    expect(found.matches.map((match) => match.key)).toEqual(['backend-20261002T075610Z-boot.log']);
    // Transcripts only, newest first: events bundles and failure captures are never read.
    expect(r.reads[0]).toBe('backend-20261002T075610Z-boot.log');
    expect(r.reads.some((key) => key.endsWith('.jsonl') || key.includes('-failed-'))).toBe(false);

    const logs: string[] = [];
    renderReleaseDiagnostics('backend', deploying, found, (line) => logs.push(line), 'plain');
    expect(logs[0]).toBe('\n=== ⚠️ backend boot bundle for 84b7e22 (backend-20261002T075610Z-boot.log): boot failed ===');
    expect(logs[1]).toContain('failed_phase=release-command');
  });

  it('caps how many transcripts it reads', () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`backend-202609${String(10 + i)}T000000Z-boot.log`, body('cccc333')]));
    const r = reader(many);
    findReleaseBundles(Object.keys(many), 'backend', deploying, r, 8);
    expect(r.reads).toHaveLength(8);
  });
});

describe('summarizeBundles', () => {
  const keys = ['backend-stage-1-pull', 'backend-20260531T090509-boot.log', 'backend-failed-20260602T093000Z.log', 'cdc-stage-1-pull'];

  it('counts owned objects and failure captures per service', () => {
    expect(summarizeBundles(keys, ['backend', 'cdc', 'yjs'])).toEqual([
      { service: 'backend', total: 3, failures: 1, latestFull: 'backend-20260531T090509-boot.log' },
      { service: 'cdc', total: 1, failures: 0, latestFull: undefined },
      { service: 'yjs', total: 0, failures: 0, latestFull: undefined },
    ]);
  });
});

describe('isEmptyPrefixLs', () => {
  it('classifies exit 1 with no output as an empty prefix', () => {
    expect(isEmptyPrefixLs(1, '', '')).toBe(true);
    expect(isEmptyPrefixLs(1, '\n', ' ')).toBe(true);
  });

  it('keeps real failures fatal', () => {
    // Denied / bad endpoint: stderr is populated.
    expect(isEmptyPrefixLs(1, '', 'An error occurred (AccessDenied)')).toBe(false);
    expect(isEmptyPrefixLs(255, '', '')).toBe(false);
    // A successful non-empty listing is not "empty prefix".
    expect(isEmptyPrefixLs(0, '2026-05-31 09:00:01 12 backend-stage-1-pull', '')).toBe(false);
  });
});

describe('emptyBootDiagGuidance', () => {
  it('names both known causes and embeds the serial-console marker for the slug', () => {
    const lines = emptyBootDiagGuidance('cella');
    expect(lines.join('\n')).toContain('::cella::');
    expect(lines.join('\n')).toContain('ObjectStorageObjectsWrite');
  });
});

describe('parseArgs', () => {
  it('parses the required flags', () => {
    expect(parseArgs(['--bucket', 'b', '--service', 'backend', '--region', 'fr-par'])).toEqual({ bucket: 'b', service: 'backend', region: 'fr-par' });
  });

  it.each([
    ['--service', 'backend', '--region', 'fr-par'],
    ['--bucket', 'b', '--region', 'fr-par'],
    ['--bucket', 'b', '--service', 'backend'],
  ])('throws when a required flag is missing', (...argv) => {
    expect(() => parseArgs(argv)).toThrow(/Usage:/);
  });
});
