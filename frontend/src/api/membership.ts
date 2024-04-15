import type { Member } from '~/types';
import { ApiError, membershipClient as client } from '.';

export const removeMembersFromOrganization = async (query: { organizationIdentifier: string; ids: string[] }) => {
  const response = await client.memberships.$delete({ query });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

export const updateUserInOrganization = async (
  organizationIdentifier: string,
  id: string,
  role?: Member['organizationRole'],
  archive?: boolean,
  muted?: boolean,
) => {
  const response = await client.memberships[':id'].$put({
    param: {
      id,
    },
    json: { role, organizationIdentifier, inactive: archive, muted },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};
