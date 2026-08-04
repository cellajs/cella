import { getFlag } from '../../lib/utils/args';
import { boot } from './boot';
import { supportedSchemaVersion } from './plan';

const bootRunnerVersion = '0.1.0-dev';

function usage(): never {
  throw new Error('Usage: infra-boot --version | supports --schema-version <n> | boot --plan <path>');
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv[0] === '--version') {
    console.info(bootRunnerVersion);
    return 0;
  }
  if (argv[0] === 'supports') {
    return Number(getFlag(argv, '--schema-version')) === supportedSchemaVersion ? 0 : 1;
  }
  if (argv[0] === 'boot') {
    const planPath = getFlag(argv, '--plan');
    if (!planPath) usage();
    await boot({ planPath });
    return 0;
  }
  usage();
}
