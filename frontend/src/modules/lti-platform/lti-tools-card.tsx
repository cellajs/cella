import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { type BaseSyntheticEvent, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zStartLtiToolRegistrationBody } from 'sdk/zod.gen';
import { z } from 'zod';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { InputFormField } from '~/modules/common/form-fields/input';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import { LtiInstallationTile } from '~/modules/lti-platform/lti-installation-tile';
import { ltiInstallationsQueryOptions, useStartLtiToolRegistrationMutation } from '~/modules/lti-platform/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { Accordion } from '~/modules/ui/accordion';
import { Form } from '~/modules/ui/field';
import { queryClient } from '~/query/query-client';
import type { QueryOrgContext } from '~/query/types';
import { formResolver } from '~/utils/form-resolver';

const registrationDialogId = 'lti-tool-registration';

const formSchema = zStartLtiToolRegistrationBody.extend({ registrationUrl: z.url().max(2048) });

type FormValues = z.infer<typeof formSchema>;

/** The message an LTI tool posts when its registration ends (LTI Dynamic Registration 1.0, section 3.7). */
const isCloseMessage = (data: unknown) =>
  typeof data === 'object' && data !== null && 'subject' in data && data.subject === 'org.imsglobal.lti.close';

/** The LTI tool's registration page in a frame; the close message from that frame's window, from whatever page it shows, ends it. */
function LtiRegistrationFrame({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source && event.source === frameRef.current?.contentWindow && isCloseMessage(event.data)) onClose();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [url]);

  return (
    <iframe
      ref={frameRef}
      src={url}
      title={t('c:add_resource', { resource: t('c:lti_tool') })}
      sandbox="allow-scripts allow-forms allow-same-origin"
      className="h-[60vh] min-h-80 w-full rounded-md border"
    />
  );
}

/** The registration address an LTI tool's administrator handed over; submitting opens the registration in a frame. */
function AddLtiToolForm({ path }: { path: QueryOrgContext }) {
  const { t } = useTranslation();
  const { mutate: start, isPending } = useStartLtiToolRegistrationMutation();
  const form = useForm<FormValues>({ resolver: formResolver(formSchema), defaultValues: { registrationUrl: '' } });

  const onSubmit = ({ registrationUrl }: FormValues, event?: BaseSyntheticEvent) => {
    if (!onlineManager.isOnline()) return toastOffline();
    // The button that submitted, an Enter in the field included: focus returns there when the dialog closes
    const submitter = event?.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    start(
      { path, body: { registrationUrl } },
      {
        onSuccess: ({ url }) => {
          form.reset();
          const close = () => dialoger.getState().remove(registrationDialogId);
          // However it closes, by the LTI tool's message or by hand, the list shows what the registration stored
          dialoger.getState().create(<LtiRegistrationFrame url={url} onClose={close} />, {
            id: registrationDialogId,
            triggerRef: { current: submitter },
            className: 'md:max-w-3xl',
            title: t('c:add_resource', { resource: t('c:lti_tool') }),
            description: t('c:lti_registration_frame.text'),
            onClose: () => queryClient.invalidateQueries({ queryKey: ltiInstallationsQueryOptions(path).queryKey }),
          });
        },
      },
    );
  };

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <InputFormField
          control={form.control}
          name="registrationUrl"
          type="url"
          label={t('c:registration_url')}
          description={t('c:registration_url.text')}
          placeholder="https://"
          required
        />
        <SubmitButton className="max-sm:w-full sm:self-start" variant="secondary" icon={<PlusIcon />} loading={isPending}>
          {t('c:add_resource', { resource: t('c:lti_tool') })}
        </SubmitButton>
      </form>
    </Form>
  );
}

/** The LTI tools installed in the organization's tenant: add one by its registration address, then approve or disable it and see where it has tabs. */
export function LtiToolsCard({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const path = { tenantId: organization.tenantId, organizationId: organization.id };
  const installations = useSuspenseQuery(ltiInstallationsQueryOptions(path)).data.results;
  const [openTile, setOpenTile] = useState<string[]>([]);

  return (
    <ToolCard label="c:lti_tools" description={t('c:lti_tools.text')}>
      <AddLtiToolForm path={path} />
      {installations.length > 0 && (
        <Accordion value={openTile} onValueChange={setOpenTile} className="mt-6 flex flex-col gap-2">
          {installations.map((installation) => (
            <LtiInstallationTile key={installation.id} installation={installation} organization={organization} />
          ))}
        </Accordion>
      )}
    </ToolCard>
  );
}
