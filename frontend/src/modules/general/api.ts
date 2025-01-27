import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { type ContextEntity, type Entity, type PageEntity, type UploadParams, UploadType } from '~/types/common';
import { generalHc } from '#/modules/general/hc';

// Create Hono clients to make requests to the backend
export const client = generalHc(config.backendUrl, clientConfig);

// Get upload token to securely upload files with imado: https://imado.eu
export const getUploadToken = async (type: UploadType, query: UploadParams = { public: false, organizationId: undefined }) => {
  const id = query.organizationId;

  if (!id && type === UploadType.Organization) return console.error('Organization id required for organization uploads');

  if (id && type === UploadType.Personal) return console.error('Personal uploads should be typed as personal');

  const preparedQuery = {
    public: String(query.public),
    organization: id,
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
export const checkSlugAvailable = async (params: { slug: string; type: Entity }) => {
  const response = await client['check-slug'].$post({
    json: params,
  });

  const json = await handleResponse(response);
  return json.success;
};

export type SuggestionsProps = {
  q: string;
  type?: PageEntity;
};
// Get suggestions
export const getSuggestions = async (query: SuggestionsProps) => {
  const response = await client.suggestions.$get({ query });

  const json = await handleResponse(response);
  return json.data;
};

export type InviteSuggestionsProps = {
  q: string;
  entityId: string;
  entityType: ContextEntity;
};

// Get invite suggestions
export const getInviteSuggestions = async (query: InviteSuggestionsProps) => {
  const response = await client['invite-suggestions'].$get({ query });

  const json = await handleResponse(response);
  return json.data;
};
