import { afterEach, describe, expect, it, vi } from 'vitest';
import { msUntilBudget, recordReportedBudgets } from '~/lib/reported-budgets';

const report = (left: string, policy: string) => recordReportedBudgets(new Headers({ RateLimit: left, 'RateLimit-Policy': policy }));

describe('reported budgets', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('must not hold background work back via a budget above its share', () => {
    report('"read";r=301;t=120', '"read";q=1000;w=300');

    expect(msUntilBudget('read', 0.3)).toBe(0);
  });

  it('must not let background work through via a budget at its share before its window ends', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    report('"read";r=300;t=120', '"read";q=1000;w=300');

    expect(msUntilBudget('read', 0.3)).toBe(120_000);
    vi.setSystemTime(Date.now() + 120_000);
    expect(msUntilBudget('read', 0.3)).toBe(0);
  });

  it("must not read one policy's budget as another's via a field with several members", () => {
    // A window ends `t` seconds from the moment the report comes in, so the clock stands still while it is read back.
    vi.useFakeTimers({ toFake: ['Date'] });
    report('"points";r=0;t=60, "read";r=900;t=60', '"points";q=10;w=3600, "read";q=1000;w=300');

    expect(msUntilBudget('read', 0.3)).toBe(0);
    expect(msUntilBudget('points', 0.3)).toBe(60_000);
  });

  it('must not hold background work back via a policy no response reported', () => {
    expect(msUntilBudget('unreported', 0.3)).toBe(0);
  });
});
