import { getContext } from 'hono/context-storage';

import type { Env } from '#/types/app';

// Access current user, organization and user memberships
export const getContextUser = () => {
  return getContext<Env>().var.user;
};

export const getOrganization = () => {
  return getContext<Env>().var.organization;
};

export const getMemberships = () => {
  return getContext<Env>().var.memberships;
};
