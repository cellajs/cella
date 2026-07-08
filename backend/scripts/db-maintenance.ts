import pc from 'picocolors';
import { runDbMaintenance } from '#/lib/db-maintenance';

const checkMark = pc.greenBright('✓');
const crossMark = pc.redBright('✗');

async function main(): Promise<void> {
  console.info(' ');
  console.info(pc.bold('Database Maintenance'));
  console.info('=====================');
  console.info(' ');

  try {
    await runDbMaintenance((msg) => console.info(`${checkMark} ${msg}`));

    console.info(' ');
    console.info(`${checkMark} Database maintenance completed successfully`);
    console.info(' ');
    process.exit(0);
  } catch (error) {
    console.error(`${crossMark} Database maintenance failed:`, error);
    process.exit(1);
  }
}

main();
