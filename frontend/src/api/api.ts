import type { AppRoute } from 'backend/server';
import config from 'config';
import { hc } from 'hono/client';
import { Member, UploadParams, UploadType } from '~/types';

export class ApiError extends Error {
  status: string;

  constructor(status: number | string, message: string) {
    super(message);

    this.status = String(status);
  }
}

export const client = hc<AppRoute>(config.backendUrl, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
});

export const githubSignInUrl = client['sign-in'].github.$url().href;

export const googleSignInUrl = client['sign-in'].google.$url().href;

export const microsoftSignInUrl = client['sign-in'].microsoft.$url().href;

export const getUploadToken = async (type: UploadType, query: UploadParams = { public: false }, organizationId?: string) => {
  if (!organizationId && type === UploadType.Organization) {
    throw new ApiError(400, 'Organization id required for organization uploads');
  }

  if (organizationId && type === UploadType.Personal) {
    throw new ApiError(400, 'Personal uploads should be typed as personal');
  }

  const preparedQuery = {
    public: String(query.public),
  };

  const response =
    type === UploadType.Organization && organizationId
      ? await client.organizations[':organizationId'].uploadtoken.$get({
          param: { organizationId },
          query: preparedQuery,
        })
      : await client.uploadtoken.$get({ query: preparedQuery });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export const getPublicCounts = async () => {
  const response = await client.public.counts.$get();

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export const signUp = async (email: string, password: string) => {
  const response = await client['sign-up'].$post({
    json: {
      email,
      password,
    },
  });
  const json = await response.json();

  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }

  return json.data;
};

export const checkEmail = async (email: string) => {
  const response = await client['check-email'].$post({
    json: {
      email,
    },
  });
  const json = await response.json();

  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }

  return json.data;
};

export const checkSlug = async (slug: string) => {
  const response = await client.users['check-slug'][':slug'].$get({
    param: {
      slug,
    },
  });

  const json = await response.json();

  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }

  return json.data;
};

export const verifyEmail = async (token: string, resend = false) => {
  const response = await client['verify-email'][':token'].$get({
    param: {
      token,
    },
    query: {
      resend: String(resend),
    },
  });

  const json = await response.json();

  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }

  return;
};

export const signIn = async (email: string, password: string) => {
  const response = await client['sign-in'].$post({
    json: {
      email,
      password,
    },
  });
  const json = await response.json();

  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }

  return json.data;
};

export const sendVerificationEmail = async (email: string) => {
  const response = await client['send-verification-email'].$post({
    json: {
      email,
    },
  });
  const json = await response.json();

  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }

  return;
};

export const sendResetPasswordEmail = async (email: string) => {
  const response = await client['reset-password'].$post({
    json: {
      email,
    },
  });
  const json = await response.json();

  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }

  return;
};

export const resetPassword = async (token: string, password: string) => {
  const response = await client['reset-password'][':token'].$post({
    param: {
      token,
    },
    json: {
      password,
    },
  });
  const json = await response.json();

  if ('error' in json) {
    throw new ApiError(response.status, json.error);
  }

  return;
};

export const getUserMenu = async () => {
  const response = await client.menu.$get();

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export type GetUsersParams = Partial<
  Omit<Parameters<(typeof client.users)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

export const getUsers = async ({ q, sort = 'id', order = 'asc', page = 0, limit = 50, role }: GetUsersParams = {}, signal?: AbortSignal) => {
  const response = await client.users.$get(
    {
      query: {
        q,
        sort,
        order,
        role,
        offset: String(page * limit),
        limit: String(limit),
      },
    },
    {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        return fetch(input, {
          ...init,
          credentials: 'include',
          signal,
        });
      },
    },
  );

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export const deleteUserById = async (userId: string) => {
  const response = await client.users[':userId'].$delete({
    param: {
      userId,
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return;
};

export const getUserBySlugOrId = async (userIdentifier: string) => {
  const response = await client.users[':userId'].$get({
    param: {
      userId: userIdentifier,
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export type UpdateUserParams = Parameters<(typeof client.users)[':userId']['$put']>['0']['json'];

export const updateUser = async (userId: string, params: UpdateUserParams) => {
  const response = await client.users[':userId'].$put({
    param: {
      userId,
    },
    json: params,
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export const createOrganization = async (name: string) => {
  const response = await client.organizations.$post({
    json: {
      name,
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export type UpdateOrganizationParams = Parameters<(typeof client.organizations)[':organizationId']['$put']>['0']['json'];

export const updateOrganization = async (organizationId: string, params: UpdateOrganizationParams) => {
  const response = await client.organizations[':organizationId'].$put({
    param: {
      organizationId,
    },
    json: params,
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export type GetOrganizationsParams = Partial<
  Omit<Parameters<(typeof client.organizations)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

export const getOrganizations = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = 50 }: GetOrganizationsParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.organizations.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: String(page * limit),
        limit: String(limit),
      },
    },
    {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        return fetch(input, {
          ...init,
          credentials: 'include',
          signal,
        });
      },
    },
  );

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export const getOrganizationBySlugOrId = async (organizationIdentifier: string) => {
  const response = await client.organizations[':organizationId'].$get({
    param: {
      organizationId: organizationIdentifier,
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export const updateUserInOrganization = async (organizationId: string, userId: string, role: Member['organizationRole']) => {
  const response = await client.organizations[':organizationId'].members[':userId'].$put({
    param: {
      organizationId,
      userId,
    },
    json: {
      role,
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export const deleteOrganizationById = async (organizationId: string) => {
  const response = await client.organizations[':organizationId'].$delete({
    param: {
      organizationId,
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return;
};

export const inviteUsersToOrganization = async (organizationId: string, emails: string[]) => {
  const response = await client.organizations[':organizationId'].members.invite.$post({
    param: {
      organizationId,
    },
    json: {
      emails,
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return;
};

export const acceptOrganizationInvite = async ({
  token,
  password,
  oauth,
}: {
  token: string;
  password?: string;
  oauth?: 'github' | 'google' | 'microsoft';
}) => {
  const response = await client.organizations['accept-invitation'][':token'].$post({
    param: {
      token,
    },
    json: {
      password,
      oauth,
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export const checkIsEmailExistsByInviteToken = async (token: string) => {
  const response = await client.organizations['check-email-exists-by-invite-token'][':token'].$get({
    param: {
      token,
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.success;
};

export type GetMembersParams = Partial<
  Omit<Parameters<(typeof client.organizations)[':organizationId']['members']['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

export const getMembersByOrganizationId = async (
  organizationId: string,
  { q, sort = 'id', order = 'asc', role, page = 0, limit = 50 }: GetMembersParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.organizations[':organizationId'].members.$get(
    {
      param: {
        organizationId,
      },
      query: {
        q,
        sort,
        order,
        offset: String(page * limit),
        limit: String(limit),
        role,
      },
    },
    {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        return fetch(input, {
          ...init,
          credentials: 'include',
          signal,
        });
      },
    },
  );

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export const removeMemberFromOrganization = async (organizationId: string, userId: string) => {
  const response = await client.organizations[':organizationId'].members[':userId'].$delete({
    param: {
      organizationId,
      userId,
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};

export const searchUsers = async (query: string) => {
  const response = await client.users.$get({
    query: {
      q: query,
      sort: 'id',
      order: 'asc',
      offset: '0',
      limit: '50',
    },
  });

  const json = await response.json();

  if ('error' in json) throw new ApiError(response.status, json.error);

  return json.data;
};
