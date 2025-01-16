import { useMutation } from '@tanstack/react-query';
import type { ApiError } from '~/lib/api';

import { queryClient } from '~/lib/router';
import {
  type CreateOrganizationParams,
  type NewsLetterBody,
  type UpdateOrganizationBody,
  createOrganization,
  deleteOrganizations,
  sendNewsletter,
  updateOrganization,
} from '~/modules/organizations/api';
import { organizationsKeys } from '~/modules/organizations/query';
import type { OrganizationWithMembership } from '~/types/common';

export const useOrganizationCreateMutation = () => {
  return useMutation<OrganizationWithMembership, ApiError, CreateOrganizationParams>({
    mutationKey: organizationsKeys.create(),
    mutationFn: createOrganization,
  });
};

export const useOrganizationUpdateMutation = () => {
  return useMutation<OrganizationWithMembership, ApiError, { idOrSlug: string; json: UpdateOrganizationBody }>({
    mutationKey: organizationsKeys.update(),
    mutationFn: updateOrganization,
    onSuccess: (updatedOrganization, { idOrSlug }) => {
      queryClient.setQueryData(organizationsKeys.single(idOrSlug), updatedOrganization);
      queryClient.invalidateQueries({ queryKey: organizationsKeys.one });
    },
    gcTime: 1000 * 10,
  });
};

export const useOrganizationDeleteMutation = () => {
  return useMutation<void, ApiError, string[]>({
    mutationKey: organizationsKeys.delete(),
    mutationFn: deleteOrganizations,
  });
};

export const useSendNewsLetterMutation = () => {
  return useMutation<boolean, ApiError, NewsLetterBody>({
    mutationKey: organizationsKeys.sendNewsLetter(),
    mutationFn: sendNewsletter,
  });
};
