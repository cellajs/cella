import { zodResolver } from '@hookform/resolvers/zod';
import { SaveIcon } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import z from 'zod';
import { createPages, Page } from '~/api.gen';
import { zCreatePagesData } from '~/api.gen/zod.gen';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { useMutation } from '~/hooks/use-mutations';
import { ApiError } from '~/lib/api';
import BlockNoteContent from '~/modules/common/form-fields/blocknote-content';
import Spinner from '~/modules/common/spinner';
import { Form, type LabelDirectionType } from '~/modules/ui/form';
import { blocknoteFieldIsDirty } from '~/utils/blocknote-field-is-dirty';
import { nanoid } from '~/utils/nanoid';
import { blocksToHTML } from '../common/blocknote/helpers';
import { CallbackArgs } from '../common/data-table/types';
import InputFormField from '../common/form-fields/input';
import { SlugFormField } from '../common/form-fields/slug';
import { toaster } from '../common/toaster/service';
import { Button, SubmitButton } from '../ui/button';

type FormValues = z.infer<typeof schema>;
const schema = zCreatePagesData.shape.body.unwrap();

type CreatePageFormProps = {
  organizationId: string;
  callback?: (args: CallbackArgs<Page>) => void;
  isDialog?: boolean;
  labelDirection?: LabelDirectionType;
  // children?: React.ReactNode;
};

export const CreatePageForm = ({ organizationId, callback, isDialog, labelDirection }: CreatePageFormProps) => {
  const { t } = useTranslation();

  // const { nextStep } = useStepper();
  const isFocused = true; // grab from context?

  const blocknoteId = useRef(`blocknote-${nanoid()}`);

  const formContainerId = 'create-organization';
  const form = useFormWithDraft(formContainerId, {
    formOptions: {
      resolver: zodResolver(schema),
      defaultValues: {
        slug: '',
        title: '',
        content: '',
        keywords: '',
        order: 0,
      },
    },
  });

  const isDirty = form.isDirty
    ? (() => {
        const { slug, title, content } = form.watch();
        return [slug, title].some((s) => s.length) || blocknoteFieldIsDirty(content);
      })()
    : false;

  // const isPublic = useProjectPublicity(projectId);

  // const { members } = useScopedWorkspaceData();
  // const projectMembers = useMemo(() => members.filter((m) => m.membership.projectId === projectId), [members]);

  const mutation = useMutation<Page[], ApiError, FormValues>({
    mutationFn: async (data) => {
      return await createPages({
        body: [
          {
            id: '',
            // organizationId: '',
            entityType: 'page',
            ...data,
            order: 0,
            keywords: '',
            status: 'unpublished',
            content: blocksToHTML(data.content),
          },
        ],
      });
    },
    onSuccess: ([data]) => {
      form.reset();
      toaster(t('common:success.create_newsletter'), 'success');
      // useSheeter.getState().remove(formContainerId);
      callback?.({ status: 'success', data });
    },
  });

  return (
    <Form {...form} labelDirection={labelDirection}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
        <InputFormField
          control={form.control}
          name="title"
          label={t('common:title')}
          // placeholder={t('common:placeholder.subject')}
          required
          inputClassName="font-bold"
        />
        {/* debounce */}
        <SlugFormField
          control={form.control}
          entityType="organization"
          label="Slug"
          // label={t('common:resource_handle', { resource: t('common:organization') })}
          // description={t('common:resource_handle.text', { resource: t('common:organization').toLowerCase() })}
          nameValue={form.watch('slug')}
        />
        {/* <FormField
          control={form.control}
          name="keywords"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('common:roles')}
                <span className="ml-1 opacity-50">*</span>
              </FormLabel>
              <FormControl>
                <SelectRoles {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        /> */}
        <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
          <BlockNoteContent
            control={form.control}
            name="content"
            baseBlockNoteProps={{
              id: blocknoteId.current,
              editable: isFocused || isDialog,
              members: [], // project members
              className: 'min-h-16 [&>.bn-editor]:min-h-16',
              // { isPublic, organizationId, onComplete }
              baseFilePanelProps: { organizationId },
              trailingBlock: false,
              // onEnterClick: form.handleSubmit(onSubmit),
            }}
          />
        </Suspense>

        {/* <AlertWrap id="test-email" variant="plain" icon={InfoIcon}>
          {t('common:test_email.text')}
        </AlertWrap> */}

        <div className="flex max-sm:flex-col max-sm:items-stretch gap-2 items-center">
          <SubmitButton disabled={!isDirty} loading={mutation.isPending}>
            <SaveIcon size={16} className="mr-2" />
            {t('common:save')}
          </SubmitButton>
          <Button
            type="reset"
            onClick={() => form.reset()}
            className={isDirty ? undefined : 'invisible'}
            variant="secondary"
            aria-label={t('common:cancel')}
          >
            {t('common:cancel')}
          </Button>
        </div>
      </form>
    </Form>
  );
};
