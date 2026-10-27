type TimeSpanUnit = 'ms' | 's' | 'm' | 'h' | 'd' | 'w';

const unitMs: Record<TimeSpanUnit, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/**
 * A duration of time, convertible between units.
 * @example
 * const timeSpan = new TimeSpan(1, 'h');
 * console.info(timeSpan.milliseconds()); // 3600000
 * console.info(timeSpan.seconds()); // 3600
 */
export class TimeSpan {
  constructor(value: number, unit: TimeSpanUnit) {
    this.value = value;
    this.unit = unit;
  }

  public value: number;
  public unit: TimeSpanUnit;

  public milliseconds(): number {
    return this.value * unitMs[this.unit];
  }

  public seconds(): number {
    return this.milliseconds() / 1000;
  }
}
