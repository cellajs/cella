import { Send } from 'lucide-react';
import { useRef, useState } from 'react';

import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '~/modules/ui/button';

export async function addEmail(email: string) {
  if (!email) return { success: false };

  const app = config.slug;

  try {
    const queryParams = new URLSearchParams({ email, app }).toString();
    const webhookUrl = config.newsletterWebhookUrl + queryParams;
    const response = await fetch(webhookUrl, {
      method: 'POST',
    });

    if (!response.ok) {
      console.error('Webhook call failed:', response);
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in addEmail:', error);
    return { success: false };
  }
}

const NewsletterForm = () => {
  const { t } = useTranslation();
  const [isPending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    let email = formRef.current?.email.value;
    if (!email) return;
    email = email.trim().toLowerCase();

    setPending(true);
    const response = await addEmail(email);

    if (response.success) {
      toast.success(t('common:success.newsletter_sign_up'));
    } else {
      toast.error(t('common:error.newsletter_sign_up'));
    }
    setPending(false);
    formRef.current?.reset();
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
