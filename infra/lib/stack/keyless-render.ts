import type * as PulumiNS from '@pulumi/pulumi';

/** One resource the program declared, as a keyless render saw it. */
export interface RenderedResource {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
  /** The provider-computed outputs the mocks stubbed for it. */
  outputs: Record<string, unknown>;
  provider?: string;
}

/**
 * Install Pulumi mocks that let the program render without a key and without Scaleway: every resource echoes its inputs, the few outputs
 * only a provider computes get fixed stubs, and the data sources the program reads (IAM applications and keys, secret containers and
 * versions) answer with fixed ids. Returns the list the declared resources are collected into. The unit tests render through it, and so
 * does the pull request check that compares what a change declares (tasks/privileged-footprint.ts).
 */
export function installKeylessMocks(
  pulumi: typeof PulumiNS,
  opts: { project: string; stack: string; preview: boolean; absentApplication?: (name: string) => boolean },
): RenderedResource[] {
  const resources: RenderedResource[] = [];
  let ipamAddresses = 0;
  pulumi.runtime.setMocks(
    {
      newResource(args) {
        // Echo inputs as outputs so chained pulumi.all() applies resolve with the values downstream resource construction needs.
        // Outputs only the provider computes get deterministic stubs: a managed database's CA certificate, a generated password, a reserved private IP, the LB's public address, the registry endpoint.
        const computedByType: Record<string, () => Record<string, unknown>> = {
          'scaleway:databases/instance:Instance': () => ({ certificate: 'mock-ca-certificate' }),
          'random:index/randomPassword:RandomPassword': () => ({ result: `random-${args.name}` }),
          'scaleway:ipam/ip:Ip': () => ({ address: `10.0.0.${++ipamAddresses}/24` }),
          'scaleway:loadbalancers/loadBalancer:LoadBalancer': () => ({ ipAddress: '203.0.113.10' }),
          'scaleway:registry/namespace:Namespace': () => ({ endpoint: `rg.nl-ams.scw.cloud/${String((args.inputs as { name?: string }).name)}` }),
        };
        const computed = computedByType[args.type]?.() ?? {};
        resources.push({
          type: args.type,
          name: args.name,
          inputs: args.inputs as Record<string, unknown>,
          outputs: computed,
          provider: args.provider,
        });
        return { id: `${args.name}-id`, state: { ...args.inputs, ...computed, id: `${args.name}-id` } };
      },
      call(args) {
        // IAM data sources pulumi-context.ts derives identity ids from; deterministic stub ids let consuming modules render without talking to Scaleway.
        if (args.token.includes('getApplication')) {
          const name = String((args.inputs as { name?: string }).name ?? 'app');
          if (opts.absentApplication?.(name)) return { id: '', applicationId: '', name };
          return { id: `${name}-id`, applicationId: `${name}-id`, name };
        }
        if (args.token.includes('getApiKey')) {
          return { id: 'mock-access-key', applicationId: 'mock-application-id', userId: 'mock-user-id', defaultProjectId: 'mock-project-id' };
        }
        // Secret Manager data sources: deterministic stubs so a module reading a secret container or version renders without talking to Scaleway.
        if (args.token.includes('getSecret')) {
          const name = String((args.inputs as { name?: string }).name ?? 'secret');
          return { id: `fr-par/${name}-id`, name };
        }
        if (args.token.includes('getVersion')) {
          const payload = JSON.stringify({ accessKey: 'mock-vm-access', secretKey: 'mock-vm-secret' });
          return { data: Buffer.from(payload).toString('base64') };
        }
        return args.inputs as Record<string, unknown>;
      },
    },
    opts.project,
    opts.stack,
    opts.preview,
  );
  return resources;
}

/** Wait until no new resource has registered for a run of event-loop turns: a VM registers only after its cloud-init's async output chain settles. */
export async function settleRender(resources: readonly unknown[]): Promise<void> {
  let quiet = 0;
  for (let seen = resources.length; quiet < 25; quiet++) {
    await new Promise((resolve) => setImmediate(resolve));
    if (resources.length !== seen) {
      seen = resources.length;
      quiet = 0;
    }
  }
}

/**
 * The fetch of a keyless render. The program's direct reads get fixed answers: the load balancer's private address from IPAM, and the
 * engine folder's secrets the main job's definition references, as present. Any other call is refused, so a render never reaches the network.
 */
export const keylessFetch: typeof fetch = async (input) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.pathname.startsWith('/ipam/v1/')) return Response.json({ ips: [{ address: '10.0.0.200/24' }] });
  if (url.pathname.startsWith('/secret-manager/') && url.pathname.endsWith('/secrets')) {
    const path = url.searchParams.get('path') ?? '/';
    const names = ['deploy-key', 'pulumi-passphrase'];
    return Response.json({ secrets: names.map((name) => ({ id: `keyless-${name}`, name, path, version_count: 1 })), total_count: names.length });
  }
  throw new Error(`a keyless render reaches no network, and the program called ${url.href}`);
};
