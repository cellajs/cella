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
import { sharesNameAmong } from '~/modules/lti-platform/lti-tool-origin';
import { ltiInstallationsQueryOptions, useStartLtiToolRegistrationMutation } from '~/modules/lti-platform/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { Accordion } from '~/modules/ui/accordion';
import { Button } from '~/modules/ui/button';
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

interface LtiRegistrationFrameProps {
  url: string;
  path: QueryOrgContext;
  onClose: () => void;
}

/**
 * The LTI tool's registration page in a frame. The close message from that frame's window, from whatever page it shows,
 * ends it once the list holds an LTI tool it did not hold before; else the dialog says the LTI tool closed its page
 * without registering.
 */
function LtiRegistrationFrame({ url, path, onClose }: LtiRegistrationFrameProps) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [unregistered, setUnregistered] = useState(false);
  const listOptions = ltiInstallationsQueryOptions(path);
  const [knownIds] = useState(() => new Set(queryClient.getQueryData(listOptions.queryKey)?.results.map(({ id }) => id)));

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (!event.source || event.source !== frameRef.current?.contentWindow || !isCloseMessage(event.data)) return;
      // A list that cannot be read tells nothing: the dialog closes
      const arrived = await queryClient.query({ ...listOptions, staleTime: 0 }).then(
        ({ results }) => results.some(({ id }) => !knownIds.has(id)),
        () => true,
      );
      if (arrived) return onClose();
      setUnregistered(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [url]);

  if (unregistered) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">{t('c:lti_tool_closed_unregistered.text')}</p>
        <Button variant="secondary" className="max-sm:w-full sm:self-start" onClick={onClose}>
          {t('c:close')}
        </Button>
      </div>
    );
  }

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
          dialoger.getState().create(<LtiRegistrationFrame url={url} path={path} onClose={close} />, {
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
  const sharesName = sharesNameAmong(installations);

  return (
    <ToolCard label="c:lti_tools" description={t('c:lti_tools.text')}>
      <AddLtiToolForm path={path} />
      {installations.length > 0 && (
        <Accordion value={openTile} onValueChange={setOpenTile} className="mt-6 flex flex-col gap-2">
          {installations.map((installation) => (
            <LtiInstallationTile
              key={installation.id}
              installation={installation}
              organization={organization}
              sharesName={sharesName(installation.name)}
            />
          ))}
        </Accordion>
      )}
    </ToolCard>
  );
}
