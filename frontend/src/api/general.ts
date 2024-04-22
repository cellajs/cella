import { UploadType, type Member, type UploadParams, type User } from '~/types';
import { ApiError, generalClient as client } from '.';
import type { PageResourceType } from 'backend/types/common';

// Get upload token to securely upload files with imado: https://imado.eu
export const getUploadToken = async (type: UploadType, query: UploadParams = { public: false, organizationId: undefined }) => {
  const id = query.organizationId;

  if (!id && type === UploadType.Organization) {
    return console.error('Organization id required for organization uploads');
  }

  if (id && type === UploadType.Personal) {
    return console.error('Personal uploads should be typed as personal');
  }

  const preparedQuery = {
    public: String(query.public),
    organizationId: id,
  };

  const response = await client['upload-token'].$get({ query: preparedQuery });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Invite users
export interface InviteProps {
  emails: string[];
  role?: Member['organizationRole'] | User['role'];
  idOrSlug?: string;
}

export const invite = async ({ emails, idOrSlug, role }: InviteProps) => {
  const response = await client.invite.$post({
    json: { emails, idOrSlug, role },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};

// Check if slug is available
export const checkSlugAvailable = async (slug: string) => {
  const response = await client['check-slug'][':slug'].$get({
    param: { slug },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Check token validation
export const checkToken = async (token: string) => {
  const response = await client['check-token'][':token'].$get({
    param: { token },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Get suggestions
export const getSuggestions = async (query: string, type?: PageResourceType | undefined) => {
  const response = await client.suggestions.$get({
    query: { q: query, type },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};
