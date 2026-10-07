import i18n from 'i18next';
import type { RefObject } from 'react';
import { ApiError } from '~/lib/api';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';

export const handleAskForHelp = (ref: RefObject<HTMLButtonElement | null>) => {
  if (!window.Gleap) return contactFormHandler(ref);
  window.Gleap.openConversations();
};

/** What a route shows for a path that matches nothing: informational, so there is nothing to reload or report. */
export const pageNotFoundError = () =>
  new ApiError({ type: 'page_not_found', severity: 'info', status: 404, message: i18n.t('error:page_not_found.text') });
