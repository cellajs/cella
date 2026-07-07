# permission-manager

Core permission-checking engine used by `getAllDecisions` (see `check.ts`).

## Key concepts

- `orderedContexts`: context types to check, ordered from most specific to root.
  For product entities (e.g., attachment): just ancestors, `[organization]`.
  For context entities (e.g., project): self and ancestors, `[project, organization]`.
- `primaryContext`: always `orderedContexts[0]`. This is where the user's "direct"
  membership to the entity is captured. For products, this is the closest ancestor.
- `actions` attribution: for each action, tracks all grants that enabled it. Used for
  debugging ("why can user delete?") and auditing.
- `options.isSystemAdmin`: when true, grants all permissions regardless of memberships.

## Example: checking "attachment" with `contextIds.organization = "org1"`

1. `orderedContexts = [organization]` (attachment's ancestor)
2. `primaryContext = organization`
3. Find the user's memberships where `contextType = organization` and `contextId = org1`
4. For each membership, look up permissions and attribute each granted action
5. Derive `can` from `actions`, capture the first membership
