import { useMutation } from '@tanstack/react-query';
import type { ApiError } from '~/lib/api';

import { type CreateRequestBody, type SendResponseBody, createRequest, deleteRequests, sendRequestMessage } from '~/modules/requests/api';
import { requestsKeys } from '~/modules/requests/query';

export const useSendRequestMessageMutation = () => {
  return useMutation<boolean, ApiError, SendResponseBody>({
    mutationKey: requestsKeys.sendMessage(),
    mutationFn: sendRequestMessage,
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
