import { createHash } from 'node:crypto';
import { type FetchLike, resolveFetch } from '../utils/fetch-like';

/** Manifest media types docker/OCI clients pull by. The registry returns the stored representation matching one of these, and the digest of its exact bytes is the pull-by-digest reference. */
const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

export interface ResolveImageDigestOptions {
  /** Registry endpoint including namespace, e.g. `rg.fr-par.scw.cloud/my-ns`. */
  registry: string;
  /** Image name inside the namespace, e.g. `infra-boot`. */
  image: string;
  tag: string;
  /** Scaleway secret key; registry basic auth is `nologin:<secret>`. */
  secretKey: string;
  fetchImpl?: FetchLike;
}

export interface BearerChallenge {
  realm: string;
  service?: string;
  scope?: string;
}

export function parseBearerChallenge(header: string): BearerChallenge | undefined {
  if (!/^bearer /i.test(header)) return undefined;
  const params = new Map<string, string>();
  for (const match of header.slice('bearer '.length).matchAll(/(\w+)="([^"]*)"/g)) {
    const [, key, value] = match;
    if (key !== undefined && value !== undefined) params.set(key, value);
  }
  const realm = params.get('realm');
  if (!realm) return undefined;
  return { realm, service: params.get('service'), scope: params.get('scope') };
}

/** Resolve the manifest digest a tag points to via the Docker Registry HTTP v2 API. The digest is sha256 over the exact manifest bytes, never a response header. Basic auth first, then the bearer token exchange on a 401. */
export async function resolveImageDigest(opts: ResolveImageDigestOptions): Promise<string> {
  const fetchImpl = resolveFetch(opts.fetchImpl);
  const [host, ...namespaceParts] = opts.registry.split('/');
  const repository = [...namespaceParts, opts.image].join('/');
  const manifestUrl = `https://${host}/v2/${repository}/manifests/${opts.tag}`;
  const basic = `Basic ${Buffer.from(`nologin:${opts.secretKey}`).toString('base64')}`;

  let response = await fetchImpl(manifestUrl, { headers: { Accept: MANIFEST_ACCEPT, Authorization: basic } });

  if (response.status === 401) {
    const challenge = parseBearerChallenge(response.headers?.get('www-authenticate') ?? '');
    if (!challenge) {
      throw new Error(
        `Registry ${host} rejected basic auth for ${repository}:${opts.tag} and sent no bearer challenge (status 401).`,
      );
    }
    const tokenUrl = new URL(challenge.realm);
    if (challenge.service) tokenUrl.searchParams.set('service', challenge.service);
    tokenUrl.searchParams.set('scope', challenge.scope ?? `repository:${repository}:pull`);
    const tokenResponse = await fetchImpl(tokenUrl.toString(), { headers: { Authorization: basic } });
    if (!tokenResponse.ok) {
      throw new Error(`Registry token exchange failed for ${repository}:${opts.tag} (status ${tokenResponse.status}).`);
    }
    const { token, access_token: accessToken } = JSON.parse(await tokenResponse.text()) as {
      token?: string;
      access_token?: string;
    };
    const bearer = token ?? accessToken;
    if (!bearer) throw new Error(`Registry token endpoint for ${host} returned no token.`);
    response = await fetchImpl(manifestUrl, {
      headers: { Accept: MANIFEST_ACCEPT, Authorization: `Bearer ${bearer}` },
    });
  }

  if (!response.ok) {
    // Attach the HTTP status so callers can branch on 404 (tag not found) without parsing the message.
    throw Object.assign(
      new Error(`Could not fetch manifest for ${repository}:${opts.tag} from ${host} (status ${response.status}).`),
      {
        status: response.status,
      },
    );
  }
  const body = await response.text();
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}
