import { Link } from '@tanstack/react-router';
import { BookOpenIcon, LifeBuoyIcon, MailIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { handleAskForHelp } from '~/modules/common/error-helpers';
import { Button } from '~/modules/ui/button';

/**
 * Support content: docs, chat support and contact links.
 */
export const SupportContent = () => {
  const { t } = useTranslation();
  const supportRef = useRef<HTMLButtonElement | null>(null);
  const contactRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="flex flex-col gap-1 pt-2 pb-8">
      <Button
        variant="ghost"
        className="w-full justify-start px-3.5 text-left"
        render={<Link to="/docs" draggable={false} />}
      >
        <BookOpenIcon className="mr-2 size-4" aria-hidden="true" />
        {t('c:api_docs')}
      </Button>
      {appConfig.has.chatSupport && (
        <Button
          ref={supportRef}
          variant="ghost"
          className="w-full justify-start px-3.5 text-left"
          onClick={() => handleAskForHelp(supportRef)}
        >
          <LifeBuoyIcon className="mr-2 size-4" aria-hidden="true" />
          {t('c:support')}
        </Button>
      )}
      <Button
        ref={contactRef}
        variant="ghost"
        className="w-full justify-start px-3.5 text-left"
        onClick={() => contactFormHandler(contactRef)}
      >
        <MailIcon className="mr-2 size-4" aria-hidden="true" />
        {t('c:contact_us')}
      </Button>
    </div>
  );
};
