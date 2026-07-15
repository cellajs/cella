export type TimeSpanUnit = 'ms' | 's' | 'm' | 'h' | 'd' | 'w';

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
    if (this.unit === 'ms') {
      return this.value;
    }
    if (this.unit === 's') {
      return this.value * 1000;
    }
    if (this.unit === 'm') {
      return this.value * 1000 * 60;
    }
    if (this.unit === 'h') {
      return this.value * 1000 * 60 * 60;
    }
    if (this.unit === 'd') {
      return this.value * 1000 * 60 * 60 * 24;
    }
    return this.value * 1000 * 60 * 60 * 24 * 7;
  }

  public seconds(): number {
    return this.milliseconds() / 1000;
  }

  public transform(x: number): TimeSpan {
    return new TimeSpan(Math.round(this.milliseconds() * x), 'ms');
  }
}

/**
 * Create an ISO date string from a time span offset from now.
 */
export function createDate(timeSpan: TimeSpan): string {
  return new Date(Date.now() + timeSpan.milliseconds()).toISOString();
}
