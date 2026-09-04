import { PgBoss } from 'pg-boss';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';

let boss: PgBoss | undefined;

export async function getPgBoss(): Promise<PgBoss> {
  if (!boss) {
    // pg-boss owns its own schema, so the queue runs on the admin credential; only the mcp worker starts it.
    if (!env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL is required for pg-boss (mcp worker queues)');
    boss = new PgBoss({ connectionString: env.DATABASE_ADMIN_URL, max: 5 });
    boss.on('error', (err) => baseLog.error('pg-boss error', { err }));
    await boss.start();
    await boss.createQueue('ai-yjs');
    await boss.createQueue('chat-retry');
  }
  return boss;
}

export async function stopPgBoss(): Promise<void> {
  if (boss) await boss.stop({ graceful: true });
}

/** Total queued (not yet started) jobs across the worker's queues, for health reporting. */
export async function getQueueDepth(): Promise<number> {
  if (!boss) return 0;
  const queues = ['ai-yjs', 'chat-retry'];
  const sizes = await Promise.all(queues.map((name) => boss?.getQueue(name).then((q) => q?.queuedCount ?? 0)));
  return sizes.reduce<number>((sum, n) => sum + (n ?? 0), 0);
}
