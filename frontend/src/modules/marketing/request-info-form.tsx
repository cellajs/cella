import { SendIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useCreateRequestMutation } from '~/modules/requests/query';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

export function RequestInfoForm() {
  const { t } = useTranslation();
  const [isDirty, setIsDirty] = useState(false);

  const { mutate: createRequest, isPending } = useCreateRequestMutation();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const email = new FormData(form).get('email')?.toString().trim().toLowerCase();
    if (!email) return;
    createRequest(
      { email, kind: 'info', message: null },
      {
        onSuccess: () => {
          toaster.success(t('c:success.request_info'));
          form.reset();
          setIsDirty(false);
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <InputGroup className="focus-ring:has-[[data-slot=input-group-control]:focus-visible]:ring-6 focus-ring:has-[[data-slot=input-group-control]:focus-visible]:ring-white/22 focus-ring:has-[[data-slot=input-group-control]:focus-visible]:ring-offset-0 mt-6 h-14 rounded-2xl border-white/55 bg-white/10 ring-6 ring-white/12 backdrop-blur-md transition focus-within:border-white/85 focus-within:ring-white/22">
        <InputGroupInput
          type="email"
          name="email"
          placeholder={t('c:placeholder.your_input', { inputLabel: t('c:email') })}
          autoComplete="email"
          aria-label={t('c:request_info_email')}
          required
          onChange={(event) => setIsDirty(event.target.value !== '')}
          // The footer band stays dark in both themes, so the field reads the dark text steps
          className="dark text-foreground py-4 pl-6 text-base/6 placeholder:text-white/72"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            variant={isDirty ? 'default' : 'ghost'}
            aria-label={t('c:request_info')}
            className={cn('dark mr-0.5 size-10 rounded-[10px]', !isDirty && 'text-white')}
          >
            {isPending ? <Spinner size="sm" noDelay className="text-current" /> : <SendIcon className="size-4" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
