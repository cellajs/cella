import { SendIcon } from 'lucide-react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useCreateRequestMutation } from '~/modules/requests/query';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '~/modules/ui/input-group';

export function SubscribeNewsletterForm() {
  const { t } = useTranslation();

  const { mutate: createRequest, isPending } = useCreateRequestMutation();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const email = new FormData(form).get('email')?.toString().trim().toLowerCase();
    if (!email) return;
    createRequest(
      { email, type: 'newsletter', message: null },
      {
        onSuccess: () => {
          toaster.success(t('c:success.newsletter_sign_up'));
          form.reset();
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <InputGroup className="mt-6 h-14 rounded-2xl border-gray-300/60 bg-transparent ring-4 ring-primary/10 transition focus-within:border-gray-300 focus-within:ring-primary/20">
        <InputGroupInput
          type="email"
          name="email"
          placeholder={t('c:placeholder.your_input', { inputLabel: t('c:email') })}
          autoComplete="email"
          aria-label={t('c:newsletter_email')}
          required
          // The footer band stays dark in both themes, so the field reads the dark text steps
          className="dark py-4 pl-6 text-base/6 text-foreground"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="submit" aria-label={t('c:newsletter_submit')} className="mr-0.5 size-10 rounded-lg text-white">
            {isPending ? <Spinner size="sm" noDelay /> : <SendIcon className="size-4" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
