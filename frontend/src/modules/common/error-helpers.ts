import type { RefObject } from 'react';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';

export const handleAskForHelp = (ref: RefObject<HTMLButtonElement | null>) => {
  if (!window.Gleap) return contactFormHandler(ref);
  window.Gleap.openConversations();
};
