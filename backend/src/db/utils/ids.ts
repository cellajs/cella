declare const kind: unique symbol;

/**
 * Who an id belongs to, as a type. The brand is an optional property, so a plain string (a route param, a lookup
 * key) still flows into any id, and every id is still a plain string downstream. What the brand rejects is one
 * kind flowing into a column of another: a service account's id into `memberships.updatedBy`, or the actor union
 * into any user-only column. `PrincipalId` is either kind, for provenance columns.
 */
export type UserId = string & { readonly [kind]?: 'user' };
export type ServiceAccountId = string & { readonly [kind]?: 'service' };
export type PrincipalId = UserId | ServiceAccountId;
