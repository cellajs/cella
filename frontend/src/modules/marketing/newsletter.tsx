import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { Send } from 'lucide-react';
import { useRef } from 'react';

import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { createRequest as baseCreateRequest } from '~/api/requests';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';

const NewsletterForm = () => {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);

  const { mutate: createRequest, isPending } = useMutation({
    mutationFn: baseCreateRequest,
    onSuccess: () => {
      toast.success(t('common:success.newsletter_sign_up', { appName: config.name }));
      formRef.current?.reset();
    },
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!onlineManager.isOnline()) return toast.warning(t('common:offline.text'));

    let email = formRef.current?.email.value;
    if (!email) return;
    email = email.trim().toLowerCase();
    createRequest({ email, type: 'newsletter', message: null });
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <div className="relative mt-6">
        <input
          type="email"
          name="email"
          id="email"
          placeholder={t('common:placeholder.your_email')}
          autoComplete="email"
          aria-label="Email for newsletter"
          required
          className="block w-full rounded-2xl border border-gray-300/40 bg-transparent py-4 pl-6 pr-20 text-base/6 text-gray-200 ring-4 ring-primary/10 transition placeholder:text-gray-300/50 focus:border-gray-300 focus:outline-none focus:ring-primary/20"
        />
        <div className="absolute inset-y-1 right-1 flex justify-end">
          <Button type="submit" variant="link" aria-label="Submit email for newsletter" loading={isPending} className="h-full text-white rounded-xl">
            <Send className="w-4" />
          </Button>
        </div>
      </div>
    </form>
  );
};

export default NewsletterForm;
