import { getContext } from 'hono/context-storage';

import type { Env } from '#/types/app';

// Access current user
export const getContextUser = () => {
  return getContext<Env>().var.user;
};

// Access the current organization that the request is scoped to
export const getContextOrganization = () => {
  return getContext<Env>().var.organization;
};

// Access all memberships for the current user
export const getContextMemberships = () => {
  return getContext<Env>().var.memberships;
};

export const getContextToken = () => {
  return getContext<Env>().var.token;
};
