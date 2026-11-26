import { type Meter, ValueType } from '@opentelemetry/api';

/** The counts a pg `Pool` keeps of its connections. */
interface PoolCounts {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  options: { max?: number };
}

/** A service's main database pool. */
export interface ObservedPool {
  /** Reported as `db.client.connection.pool.name`. */
  name: string;
  /**
   * Imports the pg pool at each collection: a service's tracing module runs before its database module loads pg.
   * Anything but a pool, such as the undefined of a process without a database, reports nothing.
   */
  load: () => Promise<unknown>;
}

const isPool = (value: unknown): value is PoolCounts => typeof value === 'object' && value !== null && 'totalCount' in value && 'options' in value;

/** Reports a pool's connections by the database client conventions: in use and idle, its maximum, and requests waiting for one. */
export function registerPoolMetrics(meter: Meter, { name, load }: ObservedPool): void {
  const count = meter.createObservableUpDownCounter('db.client.connection.count', {
    description: 'Connections of the pool in the state the state attribute names.',
    unit: '{connection}',
    valueType: ValueType.INT,
  });
  const limit = meter.createObservableUpDownCounter('db.client.connection.limit', {
    description: 'Connections the pool opens at most.',
    unit: '{connection}',
    valueType: ValueType.INT,
  });
  const pending = meter.createObservableUpDownCounter('db.client.connection.pending_requests', {
    description: 'Requests waiting for a connection of the pool.',
    unit: '{request}',
    valueType: ValueType.INT,
  });
  const ofPool = { 'db.client.connection.pool.name': name };

  meter.addBatchObservableCallback(
    async (result) => {
      const pool = await load();
      if (!isPool(pool)) return;
      result.observe(count, pool.totalCount - pool.idleCount, { ...ofPool, 'db.client.connection.state': 'used' });
      result.observe(count, pool.idleCount, { ...ofPool, 'db.client.connection.state': 'idle' });
      if (pool.options.max !== undefined) result.observe(limit, pool.options.max, ofPool);
      result.observe(pending, pool.waitingCount, ofPool);
    },
    [count, limit, pending],
  );
}
