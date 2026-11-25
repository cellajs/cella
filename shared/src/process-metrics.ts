import os from 'node:os';
import process from 'node:process';
import v8 from 'node:v8';
import type { Meter } from '@opentelemetry/api';

/**
 * Registers the process gauges the runtime instrumentation leaves out: resident memory and the memory the process may
 * use, CPU time since the last collection, uptime and the V8 heap limit.
 */
export function registerProcessMetrics(meter: Meter): void {
  const memoryUsage = meter.createObservableGauge('process.memory.usage', { description: 'Resident memory of the process.', unit: 'By' });
  const memoryLimit = meter.createObservableGauge('process.memory.limit', {
    description: 'Memory the process may use: its container limit, else the machine memory.',
    unit: 'By',
  });
  const cpuUtilization = meter.createObservableGauge('process.cpu.utilization', {
    description: 'CPU time since the last collection over the elapsed time and the CPUs available to the process.',
    unit: '1',
  });
  const uptime = meter.createObservableGauge('process.uptime', { description: 'Time since the process started.', unit: 's' });
  const heapSizeLimit = meter.createObservableGauge('v8js.memory.heap.size_limit', {
    description: 'Size the V8 heap may grow to, all spaces together.',
    unit: 'By',
  });

  // 0 or UINT64_MAX without a container limit.
  const constrained = process.constrainedMemory();
  const limit = constrained > 0 && constrained <= os.totalmem() ? constrained : os.totalmem();
  const cpus = os.availableParallelism();
  let lastCpu = process.cpuUsage();
  let lastAt = process.hrtime.bigint();

  meter.addBatchObservableCallback(
    (result) => {
      result.observe(memoryUsage, process.memoryUsage.rss());
      result.observe(memoryLimit, limit);
      result.observe(uptime, process.uptime());
      result.observe(heapSizeLimit, v8.getHeapStatistics().heap_size_limit);

      const cpu = process.cpuUsage();
      const now = process.hrtime.bigint();
      // Microseconds of CPU time the process could have used since the last collection.
      const available = (Number(now - lastAt) / 1000) * cpus;
      if (available > 0) {
        result.observe(cpuUtilization, (cpu.user - lastCpu.user) / available, { 'cpu.mode': 'user' });
        result.observe(cpuUtilization, (cpu.system - lastCpu.system) / available, { 'cpu.mode': 'system' });
      }
      lastCpu = cpu;
      lastAt = now;
    },
    [memoryUsage, memoryLimit, cpuUtilization, uptime, heapSizeLimit],
  );
}
