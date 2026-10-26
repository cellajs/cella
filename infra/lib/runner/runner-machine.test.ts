import { describe, expect, it } from 'vitest';
import { runnerCloudConfig } from './runner-machine';

describe('the runner machine', () => {
  it('keeps the runner key in the one file only root reads', () => {
    const document = runnerCloudConfig({
      values: {
        SCW_SECRET_KEY: 'runner-secret-0000',
        RELEASE: 'a'.repeat(40),
        REPO: 'https://github.com/acme/app.git',
        NODE_IMAGE: 'node:26-bookworm',
      },
      environments: [
        { environment: 'staging', projectId: 'p1', region: 'nl-ams', definition: 'acme-staging-main', repository: 'https://github.com/acme/app.git' },
      ],
    });
    const files = document.split('\n  - path: ').slice(1);
    expect(files.filter((file) => file.includes('runner-secret-0000')).map((file) => file.split('\n')[0])).toEqual(['/etc/runner/env']);
    expect(files.find((file) => file.startsWith('/etc/runner/env'))).toContain("permissions: '0600'");
    expect(document.split('runcmd:')[1]).not.toContain('runner-secret-0000');
  });
});
