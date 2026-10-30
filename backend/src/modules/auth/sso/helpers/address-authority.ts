import type { Federation } from '#/modules/auth/sso/helpers/federations';
import type { ConnectionModel } from '#/modules/connections/connections-db';

/**
 * Whether a sign-in through the connection proves the address it asserts: the federation vouches for its institutions'
 * mailboxes (`addressAuthority`) and the address is on one of the connection's domains or a subdomain of one. The
 * federation passes any address an IdP releases, so this domain check is what ties the address to the institution.
 * @param email - Lower case, as `transformSsoClaims` gives it.
 */
export const provesAddress = (
  federation: Pick<Federation, 'addressAuthority'>,
  connection: Pick<ConnectionModel, 'claimValues'>,
  email: string,
): boolean => {
  if (!federation.addressAuthority) return false;
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const domain = email.slice(at + 1);
  return connection.claimValues.some((value) => domain === value || domain.endsWith(`.${value}`));
};
