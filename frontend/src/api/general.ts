import type { InferResponseType } from 'hono';
import { type Member, type UploadParams, UploadType, type User } from '~/types';
import { ApiError, generalClient as client } from '.';

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
export const invite = async (emails: string[], role?: Member['organizationRole'] | User['role'], organizationIdentifier?: string) => {
  const response = await client.invite.$post({
    json: { emails, organizationIdentifier, role },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};

// Check if slug is available
export const checkSlug = async (slug: string) => {
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

type SuggestionsResponse = Extract<InferResponseType<typeof client.suggestions.$get>, { data: unknown }>['data'];

export type UserSuggestion = Extract<SuggestionsResponse[0], { email: string }>;
export type OrganizationSuggestion = Extract<SuggestionsResponse[0], { name: string }>;

type Suggestions<T extends 'user' | 'organization'> = T extends 'user' ? UserSuggestion[] : OrganizationSuggestion[];

// Get suggestions
export const getSuggestions = async <T extends 'user' | 'organization'>(query: string, type?: T): Promise<Suggestions<T>> => {
  const response = await client.suggestions.$get({
    query: { q: query, type },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);

  const data = json.data as SuggestionsResponse;

  return data as Suggestions<T>;
};
