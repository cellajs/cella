export type EnvFileUndeliverableReason = 'empty' | 'multiline';

/** Discriminated union so a failed check always carries its reason. */
export type EnvFileDeliverability = { ok: true } | { ok: false; reason: EnvFileUndeliverableReason };

/** Whether `value` can be written as a single `KEY=value` line in an env file. */
export function isEnvFileDeliverable(value: string): EnvFileDeliverability {
  if (value === '') return { ok: false, reason: 'empty' };
  if (value.includes('\n') || value.includes('\r')) return { ok: false, reason: 'multiline' };
  return { ok: true };
}
