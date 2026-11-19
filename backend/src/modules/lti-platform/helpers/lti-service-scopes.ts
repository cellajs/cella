import { type AccessScope, accessScopes } from 'shared';
import { ltiNrps } from '#/lib/lti-vocabulary';

/**
 * The LTI service scope that stands for each access scope an installed LTI tool may hold. An LTI tool asks for the
 * service scope at registration and in a token request, and the platform's configuration offers it. The grant, the
 * token and the guards hold the access scope.
 */
const serviceScopes: Partial<Record<AccessScope, string>> = { 'user:read': ltiNrps.scope };

/** The LTI service scope an access scope goes by on the wire; undefined for one no LTI service names. */
export const ltiServiceScope = (scope: AccessScope): string | undefined => serviceScopes[scope];

/** The access scope an LTI service scope stands for; undefined for any other scope. */
export const accessScopeOfLtiService = (serviceScope: string): AccessScope | undefined =>
  accessScopes.all.find((scope) => serviceScopes[scope] === serviceScope);
