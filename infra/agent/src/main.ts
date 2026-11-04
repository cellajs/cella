import { readFile } from 'node:fs/promises';
import { getFlag } from '../../lib/utils/args';
import { runAgent } from './agent';
import { boot } from './boot';
import { execCommand, mustExec } from './exec';
import { serveHealth } from './health';
import { createJsonLogger } from './logger';
import { readManifest } from './manifest';
import { parseBootPlanJson, supportedSchemaVersion } from './plan';

const agentVersion = '0.2.0-dev';

/** Ceiling on stopping the app containers: Compose waits each one's stop grace period before it kills it. */
const stopTimeoutMs = 120_000;

function usage(): never {
  throw new Error('Usage: infra-agent --version | supports --schema-version <n> | agent --plan <path>');
}

/** Run the agent for the plan at `planPath`, as long as the machine runs: its health ports keep the process alive after a drain. */
async function startAgent(planPath: string): Promise<never> {
  const plan = parseBootPlanJson(await readFile(planPath, 'utf-8'), planPath);
  const logger = createJsonLogger({ service: plan.service, release: plan.releaseSha });
  const profiles = plan.services.flatMap((service) => ['--profile', service]);
  await runAgent(
    {
      boot: () => boot({ planPath }),
      readManifest: () => readManifest(),
      stopServices: async () => {
        await mustExec(execCommand, 'docker', ['compose', ...profiles, 'stop', ...plan.services], { cwd: '/opt/app', timeoutMs: stopTimeoutMs });
      },
      serve: (state) => {
        serveHealth({ ports: plan.agent.ports, release: plan.releaseSha, state, log: (message) => logger.log('warn', 'health', { message }) });
      },
      sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
      log: (step, fields) => logger.log('info', step, fields),
    },
    { drainSeconds: plan.agent.drainSeconds },
  );
  return new Promise<never>(() => {});
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv[0] === '--version') {
    console.info(agentVersion);
    return 0;
  }
  if (argv[0] === 'supports') {
    return Number(getFlag(argv, '--schema-version')) === supportedSchemaVersion ? 0 : 1;
  }
  if (argv[0] === 'agent') {
    const planPath = getFlag(argv, '--plan');
    if (!planPath) usage();
    return startAgent(planPath);
  }
  usage();
}
