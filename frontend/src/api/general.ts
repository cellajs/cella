import { UploadParams, UploadType } from '~/types';
import { ApiError, client } from '.';

// Get upload token to securely upload files with imado: https://imado.eu
export const getUploadToken = async (type: UploadType, query: UploadParams = { public: false, organizationId: undefined }) => {
  const id = query.organizationId;

  if (!id && type === UploadType.Organization) {
    throw new ApiError(400, 'Organization id required for organization uploads');
  }

  if (id && type === UploadType.Personal) {
    throw new ApiError(400, 'Personal uploads should be typed as personal');
  }

  const preparedQuery = {
    public: String(query.public),
    organizationId: id,
  };

  const response = await client['upload-token'].$get({ query: preparedQuery });

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};

// Get public counts for about page
export const getPublicCounts = async () => {
  const response = await client.public.counts.$get();

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};

// Check if slug is available
export const checkSlug = async (slug: string) => {
  const response = await client['check-slug'][':slug'].$get({
    param: { slug },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};

// Invite users
export const invite = async (emails: string[], organizationIdentifier?: string) => {
  const response = await client.invite.$post({
    json: { emails, organizationIdentifier },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return;
};

// Accept an invitation
export const acceptInvite = async ({
  token,
  password,
  oauth,
}: {
  token: string;
  password?: string;
  oauth?: 'github' | 'google' | 'microsoft';
}) => {
  const response = await client['accept-invite'][':token'].$post({
    param: { token },
    json: { password, oauth },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.data;
};

// Check invite
export const checkInvite = async (token: string) => {
  const response = await client['check-invite'][':token'].$get({
    param: { token },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(response.status, json.error);
  return json.success;
};
