import { useMutation } from '@tanstack/react-query';
import type { ApiError } from '~/lib/api';

import { type CreateRequestBody, type SendResponseBody, createRequest, deleteRequests, sendResponse } from '~/modules/requests/api';
import { requestsKeys } from '~/modules/requests/query';

export const useSendNewsLetterMutation = () => {
  return useMutation<boolean, ApiError, SendResponseBody>({
    mutationKey: requestsKeys.sendNewsletter(),
    mutationFn: sendResponse,
  });
};

export const useCreateRequestsMutation = () => {
  return useMutation<boolean, ApiError, CreateRequestBody>({
    mutationKey: requestsKeys.create(),
    mutationFn: createRequest,
  });
};

export const useDeleteRequestsMutation = () => {
  return useMutation<boolean, ApiError, string[]>({
    mutationKey: requestsKeys.delete(),
    mutationFn: deleteRequests,
  });
};
