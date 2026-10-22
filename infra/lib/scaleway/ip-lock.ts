// The IAM condition that admits a key from a fixed set of addresses only, and its reading back from a live policy. Scaleway evaluates it on
// every API the engine calls (probed 2026-10-13): IAM, Secret Manager and Object Storage refuse the call, while the database and Instances
// APIs answer a list with nothing in it and refuse a read by id. Only public IPv4 addresses are supported in `request.ip`.

const SINGLE = /^(\d+(?:\.\d+){3})\/32$/;
const RANGE = /^\d+(?:\.\d+){3}\/\d{1,2}$/;

/**
 * The CEL condition that holds for a request from one of `cidrs` (canonical IPv4 CIDRs, as `parseAclInput` returns them). Single addresses
 * share one `in [...]` list and every wider range gets its own `cidr(...).containsIP(...)`: the two forms the probe saw let an address in
 * and keep another out. An empty list throws, as a rule without its condition would admit every address.
 */
export function ipCondition(cidrs: readonly string[]): string {
  if (cidrs.length === 0) throw new Error('ipCondition: no address given; an operator rule must never be written without its condition');
  for (const cidr of cidrs) if (!RANGE.test(cidr)) throw new Error(`ipCondition: '${cidr}' is not an IPv4 CIDR`);
  const singles = cidrs.flatMap((cidr) => SINGLE.exec(cidr)?.[1] ?? []);
  const ranges = cidrs.filter((cidr) => !SINGLE.test(cidr));
  return [
    ...(singles.length > 0 ? [`request.ip in [${singles.map((address) => `'${address}'`).join(', ')}]`] : []),
    ...ranges.map((range) => `cidr('${range}').containsIP(request.ip)`),
  ].join(' || ');
}

/** The CIDRs a condition written by {@link ipCondition} admits, in its order; empty for a condition of another shape or none. */
export function ipConditionCidrs(condition: string | undefined): string[] {
  if (!condition) return [];
  const cidrs: string[] = [];
  for (const part of condition.split(' || ')) {
    const list = part.match(/^request\.ip in \[(.*)\]$/);
    const range = part.match(/^cidr\('([^']+)'\)\.containsIP\(request\.ip\)$/);
    if (list) cidrs.push(...[...(list[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => `${match[1]}/32`));
    else if (range?.[1]) cidrs.push(range[1]);
    else return [];
  }
  return cidrs;
}

const toNumber = (address: string): number => address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);

/** Whether `address` (IPv4) lies in one of `cidrs`. */
export function ipAllowed(address: string, cidrs: readonly string[]): boolean {
  return cidrs.some((cidr) => {
    const [network = '', prefix = '32'] = cidr.split('/');
    const size = 2 ** (32 - Number(prefix));
    return Math.floor(toNumber(address) / size) === Math.floor(toNumber(network) / size);
  });
}
