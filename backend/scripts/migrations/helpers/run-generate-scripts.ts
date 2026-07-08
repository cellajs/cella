import pc from 'picocolors';
import { checkMark } from '#/utils/console';
import type { GenerateScript } from '#/../scripts/types';

export type { GenerateScript } from '#/../scripts/types';

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run all generation scripts.
 *
 * Scripts are executed in filename order (drizzle first via 00- prefix,
 * then migration scripts via 10- prefix).
 *
 * A 1-second delay is added between migration scripts to ensure unique timestamps.
 */
export async function runGenerateScripts(scripts: GenerateScript[]): Promise<void> {
  console.info('');
  console.info(pc.bold(`Running ${scripts.length} generation scripts...`));
  console.info('');

  let hasRunAny = false;

  for (const script of scripts) {
    // Delay migration scripts so timestamped folders remain unique.
    if (script.type === 'migration' && hasRunAny) {
      await sleep(1000);
    }

    const typeLabel = script.type === 'drizzle' ? 'drizzle' : 'migration';
    const label = pc.cyan(`[${script.name}]`);
    console.info(`${label} ${pc.dim(`(${typeLabel})`)}`);

    try {
      await script.run();
    } catch (err) {
      console.error(`${label} ${pc.red('Failed')}`);
      throw err;
    }

    hasRunAny = true;
  }

  console.info(`${checkMark} ${pc.bold('All generation scripts completed')}`);
  console.info('');
}
