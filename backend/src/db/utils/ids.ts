declare const kind: unique symbol;

/**
 * Who an id belongs to, as a type: what the brand rejects is one kind flowing into a column of another (a service
 * account's id into `memberships.updatedBy`, the actor union into a user-only column). The brand is an optional
 * property, so a plain string (a route param, a lookup key) still flows into any id and every id stays a plain
 * string downstream. `PrincipalId` is either kind, for provenance columns.
 */
export type UserId = string & { readonly [kind]?: 'user' };
export type ServiceAccountId = string & { readonly [kind]?: 'service' };
export type PrincipalId = UserId | ServiceAccountId;
