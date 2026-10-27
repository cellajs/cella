import pc from 'picocolors';
import { migrateDatabase } from './db/migrate-database';

await migrateDatabase('migrations');

console.info(pc.green('✓ Migrations complete'));
process.exit(0);
