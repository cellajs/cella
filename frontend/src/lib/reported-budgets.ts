/** What the API last reported of a budget: its quota, what is left of it and when its window ends. */
interface ReportedBudget {
  quota: number;
  remaining: number;
  resetsAt: number;
}

const budgets = new Map<string, ReportedBudget>();

/** The numeric parameters of each `"name";key=value` member of a structured-field list, by name. */
const parseMembers = (field: string | null) => {
  const members = new Map<string, Record<string, number>>();
  for (const member of field?.split(',') ?? []) {
    const [name, ...params] = member.trim().split(';');
    if (!name?.startsWith('"') || !name.endsWith('"')) continue;
    const values = params.map((param) => param.split('=')).map(([key, value]) => [key.trim(), Number(value)]);
    members.set(name.slice(1, -1), Object.fromEntries(values));
  }
  return members;
};

/** Keeps the budgets a response reports, in the `RateLimit` and `RateLimit-Policy` fields of the IETF httpapi draft. */
export const recordReportedBudgets = (headers: Headers) => {
  const left = headers.get('ratelimit');
  if (!left) return;
  const policies = parseMembers(headers.get('ratelimit-policy'));
  for (const [name, { r, t }] of parseMembers(left)) {
    const quota = policies.get(name)?.q;
    if (!quota || !Number.isFinite(r) || !Number.isFinite(t)) continue;
    budgets.set(name, { quota, remaining: r, resetsAt: Date.now() + t * 1000 });
  }
};

/**
 * Milliseconds until `policy` has more than `share` of its quota left: the end of its window while it has no more, else
 * 0, as for a policy no response reported.
 */
export const msUntilBudget = (policy: string, share: number) => {
  const budget = budgets.get(policy);
  const msLeft = budget ? budget.resetsAt - Date.now() : 0;
  if (!budget || msLeft <= 0 || budget.remaining > budget.quota * share) return 0;
  return msLeft;
};
