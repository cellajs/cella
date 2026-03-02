import { SendIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { useCreateRequestMutation } from '~/modules/requests/query';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '~/modules/ui/input-group';

export function SubscribeNewsletterForm() {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);

  const { mutate: createRequest, isPending } = useCreateRequestMutation();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    let email = formRef.current?.email.value;
    if (!email) return;
    email = email.trim().toLowerCase();
    createRequest(
      { email, type: 'newsletter', message: null },
      {
        onSuccess: () => {
          toaster(t('common:success.newsletter_sign_up', { appName: appConfig.name }), 'success');
          formRef.current?.reset();
        },
      },
    );
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <InputGroup className="mt-6 h-14 rounded-2xl border-gray-300/40 bg-transparent ring-4 ring-primary/10 transition focus-within:border-gray-300 focus-within:ring-primary/20">
        <InputGroupInput
          type="email"
          name="email"
          id="email"
          placeholder={t('common:placeholder.your_email')}
          autoComplete="email"
          aria-label="Email for newsletter"
          required
          className="py-4 pl-6 text-base/6 text-gray-200 placeholder:text-gray-300/50"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            aria-label="Submit email for newsletter"
            className="text-white size-10 rounded-lg mr-0.5"
          >
            {isPending ? <Spinner className="w-4 h-4" noDelay /> : <SendIcon className="w-4" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
