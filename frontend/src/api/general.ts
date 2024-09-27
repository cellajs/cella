import { config } from 'config';
import { type Entity, type UploadParams, UploadType } from '~/types/common';
import { generalHc } from '#/modules/general/hc';
import type { EnabledOauthProviderOptions } from '#/types/common';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = generalHc(config.backendUrl, clientConfig);

// Get upload token to securely upload files with imado: https://imado.eu
export const getUploadToken = async (type: UploadType, query: UploadParams = { public: false, organizationId: undefined }) => {
  const id = query.organizationId;

  if (!id && type === UploadType.Organization) return console.error('Organization id required for organization uploads');

  if (id && type === UploadType.Personal) return console.error('Personal uploads should be typed as personal');

  const preparedQuery = {
    public: String(query.public),
    organizationId: id,
  };

  const response = await client['upload-token'].$get({ query: preparedQuery });

  const json = await handleResponse(response);
  return json.data;
};

export interface SystemInviteProps {
  emails: string[];
  role: 'user';
}

// Invite users
export const invite = async (values: SystemInviteProps) => {
  const response = await client.invite.$post({
    json: values,
  });

  await handleResponse(response);
};

// Check if slug is available
export const checkSlugAvailable = async (params: { slug: string }) => {
  const response = await client['check-slug'].$post({
    json: params,
  });

  const json = await handleResponse(response);
  return json.success;
};

// Check token validation
export const checkToken = async (token: string) => {
  const response = await client['check-token'].$post({
    json: { token },
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get suggestions
export const getSuggestions = async (query: string, type?: Entity | undefined) => {
  const response = await client.suggestions.$get({
    query: { q: query, type },
  });

  const json = await handleResponse(response);
  return json.data;
};

interface AcceptInviteProps {
  token: string;
  password?: string;
  oauth?: EnabledOauthProviderOptions | undefined;
}

// Accept an invitation
export const acceptInvite = async ({ token, password, oauth }: AcceptInviteProps) => {
  const response = await client.invite[':token'].$post({
    param: { token },
    json: { password, oauth },
  });

  const json = await handleResponse(response);
  return json.success;
};
