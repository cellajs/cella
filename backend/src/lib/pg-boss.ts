import { PgBoss } from 'pg-boss';
import { env } from '#/env';

let boss: PgBoss | undefined;

export async function getPgBoss(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss({ connectionString: env.DATABASE_ADMIN_URL, max: 5 });
    boss.on('error', (err) => console.error('[pg-boss]', err));
    await boss.start();
    await boss.createQueue('ai-yjs');
    await boss.createQueue('chat-retry');
  }
  return boss;
}

export async function stopPgBoss(): Promise<void> {
  if (boss) await boss.stop({ graceful: true });
}
