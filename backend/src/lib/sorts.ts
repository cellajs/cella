import { ApiOrganization, ApiOrganizationUser } from '../modules/organizations/schema';
import { ApiUser } from '../modules/users/schema';

export const sortUsersByRole = (order: 'asc' | 'desc') => (a: ApiUser, b: ApiUser) => {
  if (order === 'asc') {
    if (a.role === 'ADMIN' && b.role === 'ADMIN') {
      return 0;
    }
    if (a.role === 'ADMIN') {
      return -1;
    }
    if (b.role === 'ADMIN') {
      return 1;
    }
    return a.role.localeCompare(b.role);
  }

  if (a.role === 'ADMIN' && b.role === 'ADMIN') {
    return 0;
  }
  if (a.role === 'ADMIN') {
    return 1;
  }
  if (b.role === 'ADMIN') {
    return -1;
  }

  return b.role.localeCompare(a.role);
};

export const sortOrganizationsByRole = (order: 'asc' | 'desc') => (a: ApiOrganization, b: ApiOrganization) => {
  if (order === 'asc') {
    if (a.userRole === 'ADMIN' && b.userRole === 'ADMIN') {
      return 0;
    }
    if (a.userRole === 'ADMIN') {
      return -1;
    }
    if (b.userRole === 'ADMIN') {
      return 1;
    }
    return a.userRole.localeCompare(b.userRole);
  }

  if (a.userRole === 'ADMIN' && b.userRole === 'ADMIN') {
    return 0;
  }
  if (a.userRole === 'ADMIN') {
    return 1;
  }
  if (b.userRole === 'ADMIN') {
    return -1;
  }

  return b.userRole.localeCompare(a.userRole);
};

export const sortOrganizationUsersByRole = (order: 'asc' | 'desc') => (a: ApiOrganizationUser, b: ApiOrganizationUser) => {
  if (order === 'asc') {
    if (a.organizationRole === 'ADMIN' && b.organizationRole === 'ADMIN') {
      return 0;
    }
    if (a.organizationRole === 'ADMIN') {
      return -1;
    }
    if (b.organizationRole === 'ADMIN') {
      return 1;
    }
    return a.organizationRole.localeCompare(b.organizationRole);
  }

  if (a.organizationRole === 'ADMIN' && b.organizationRole === 'ADMIN') {
    return 0;
  }
  if (a.organizationRole === 'ADMIN') {
    return 1;
  }
  if (b.organizationRole === 'ADMIN') {
    return -1;
  }

  return b.organizationRole.localeCompare(a.organizationRole);
};

type KeysMatching<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

export const sortObjectsByNumberField =
  // biome-ignore lint/suspicious/noExplicitAny: any is needed for generic
    <T extends Record<string, any>>(key: KeysMatching<T, number>, order: 'asc' | 'desc') =>
    (a: T, b: T) => {
      if (order === 'asc') {
        return a[key] - b[key];
      }
      return b[key] - a[key];
    };
