import type { RunnerEnvironment } from '../../runner/src/config';
import { type CloudConfigFile, cloudConfigDocument } from '../utils/cloud-config';

/** The name of the runner's project, application, address, security group and machine: one runner per organization (D5), the app's (D30). */
export function runnerName(appSlug: string): string {
  return `${appSlug}-runner`;
}

/** Where the runner key is kept in the runner's project, for the replace to put into the machine's user data (D28). */
export const RUNNER_KEY = { name: 'runner-key', path: '/runner' } as const;

/** What the runner machine's script reads from `/etc/runner/env`, a file only root reads. */
export interface RunnerValues {
  /** The runner key's secret part: the token its Serverless Jobs calls carry. */
  SCW_SECRET_KEY: string;
  /** The full commit the runner's program is fetched at. */
  RELEASE: string;
  /** The https URL of the repository that holds the program. */
  REPO: string;
  /** The `node` image at the root `engines.node`, which has git. */
  NODE_IMAGE: string;
}

/**
 * The runner's script: in a `node` container, fetch the release's commit and run the runner's program from it, on Node alone. Its output goes
 * to the serial console (D31); systemd starts it again 30 s after it ends, so a fetch that failed is tried again.
 */
const RUNNER_SCRIPT = `#!/bin/bash
set -euo pipefail
set -a; . /etc/runner/env; set +a
mkdir -p /var/lib/runner
exec docker run --rm --name runner --env-file /etc/runner/env -v /etc/runner/config.json:/etc/runner/config.json:ro -v /var/lib/runner:/var/lib/runner "$NODE_IMAGE" bash -euo pipefail -c '
src=/var/lib/runner/src
[ -d "$src/.git" ] || { git init -q "$src"; git -C "$src" remote add origin "$REPO"; }
git -C "$src" fetch -q --depth 1 origin "$RELEASE"
git -C "$src" checkout -q --force FETCH_HEAD
echo "runner: release $RELEASE"
exec node "$src/infra/runner/src/main.ts" --config /etc/runner/config.json --state-dir /var/lib/runner/state'
`;

const UNIT = [
  '[Unit]',
  "Description=runner: starts each environment's deploy when its target moves",
  'After=network-online.target docker.service',
  'Wants=network-online.target',
  'Requires=docker.service',
  '[Service]',
  'ExecStart=/usr/local/bin/runner.sh',
  'Restart=always',
  'RestartSec=30',
  'StandardOutput=journal+console',
  'StandardError=journal+console',
  '[Install]',
  'WantedBy=multi-user.target',
].join('\n');

/** The runner machine's cloud-init: its values, its list of environments, its script and a unit that keeps it running. */
export function runnerCloudConfig(opts: { values: RunnerValues; environments: readonly RunnerEnvironment[] }): string {
  const files: CloudConfigFile[] = [
    {
      path: '/etc/runner/env',
      permissions: '0600',
      content: Object.entries(opts.values)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    },
    { path: '/etc/runner/config.json', permissions: '0644', content: JSON.stringify({ environments: opts.environments }, null, 2) },
    { path: '/usr/local/bin/runner.sh', permissions: '0755', content: RUNNER_SCRIPT.trimEnd() },
    { path: '/etc/systemd/system/runner.service', permissions: '0644', content: UNIT },
  ];
  return cloudConfigDocument(files, ['systemctl daemon-reload', 'systemctl enable --now --no-block runner.service']);
}
