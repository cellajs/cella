import { ArrowDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TextEffect } from '~/modules/common/text-effect';
import type { Invitation } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';

interface WelcomeTextProps {
  invitations: Invitation[];
  onStart: () => void;
}

export function WelcomeText({ invitations, onStart }: WelcomeTextProps) {
  const { t } = useTranslation();

  // An invited user is greeted with what they came for, not with the pitch for starting something new.
  const [firstInvitation] = invitations;
  let text = t('c:onboarding_welcome.text');
  if (invitations.length > 1) text = t('c:onboarding_welcome_invitations.text', { count: invitations.length });
  else if (firstInvitation) text = t('c:onboarding_welcome_invited.text', { entityName: firstInvitation.entity.name });

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 p-8 text-center">
      <h1 className="font-bold text-2xl">{t('c:onboarding_welcome')}</h1>
      <TextEffect text={text} className="pb-8 font-medium text-2xl text-foreground sm:text-4xl sm:leading-12 md:text-5xl md:leading-16" />
      <Button onClick={onStart} className="max-sm:w-full">
        {t('c:get_started')}
        <ArrowDownIcon className="repeat-5 -rotate-90 animate-bounce motion-reduce:animate-none" />
      </Button>
    </div>
  );
}
