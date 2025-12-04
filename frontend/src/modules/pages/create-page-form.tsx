import { zodResolver } from '@hookform/resolvers/zod';
import { SaveIcon } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPages, type Page } from '~/api.gen';
import { zCreatePagesData } from '~/api.gen/zod.gen';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import BlockNoteContent from '~/modules/common/form-fields/blocknote-content';
import Spinner from '~/modules/common/spinner';
import { useTableMutation } from '~/modules/pages/utils/mutations';
import { Form, type LabelDirectionType } from '~/modules/ui/form';
import { useUserStore } from '~/store/user';
import { blocknoteFieldIsDirty } from '~/utils/blocknote-field-is-dirty';
import { nanoid } from '~/utils/nanoid';
import { blocksToHTML } from '../common/blocknote/helpers';
import { CallbackArgs } from '../common/data-table/types';
import InputFormField from '../common/form-fields/input';
import { SlugFormField } from '../common/form-fields/slug';
import { toaster } from '../common/toaster/service';
import { Button, SubmitButton } from '../ui/button';
import { Separator } from '../ui/separator';

// type FormValues = z.infer<typeof schema>;
const schema = zCreatePagesData.shape.body.unwrap();

type CreatePageFormProps = {
  organizationId: string;
  callback?: (args: CallbackArgs<Page>) => void;
  isDialog?: boolean;
  labelDirection?: LabelDirectionType;
  // children?: React.ReactNode;
};

type PageData = Partial<Page> & Pick<Page, 'title' | 'content' | 'keywords'>;

const createPage = (pageData: PageData, createdBy: string): Page => {
  const createdAt = new Date().toISOString();
  return {
    id: nanoid(),
    entityType: 'page',
    slug: pageData.slug ?? pageData.title.toLowerCase().split(' ').join('-'),
    status: 'unpublished',
    parentId: null,
    displayOrder: 0,
    createdAt,
    createdBy,
    modifiedAt: createdAt,
    modifiedBy: createdBy,
    ...pageData,
  };
};

export const CreatePageForm = ({ organizationId, callback, isDialog, labelDirection }: CreatePageFormProps) => {
  const { t } = useTranslation();

  const isFocused = true; // grab from context?

  const blocknoteId = useRef(`blocknote-${nanoid()}`);

  const formContainerId = 'create-organization';
  const form = useFormWithDraft(formContainerId, {
    formOptions: {
      resolver: zodResolver(schema),
      defaultValues: {
        id: nanoid(),
        slug: '',
        title: '',
        content: '',
        keywords: '',
        status: 'unpublished',
        parentId: null,
        displayOrder: 0,
      },
    },
  });

  const isDirty = form.isDirty
    ? (() => {
        const { slug, title, content } = form.watch();
        return [slug, title].some((s) => s.length) || blocknoteFieldIsDirty(content);
      })()
    : false;

  const mutation = useTableMutation({
    table: 'pages',
    type: 'create',
    mutationFn: async (body: Page[]) => {
      console.log(body);
      return await createPages({ body });
    },
  });

  const { user } = useUserStore();
  const handleSubmit = form.handleSubmit((data) => {
    const page = createPage(
      {
        entityType: 'page',
        ...data,
        content: blocksToHTML(data.content),
        keywords: 'test-tag', //
        status: 'unpublished', //
      },
      user.id,
    );

    return mutation.mutate([page], {
      onSuccess: ([data]) => {
        form.reset();
        toaster(t('common:success.create_newsletter'), 'success');
        // useSheeter.getState().remove(formContainerId);
        callback?.({ status: 'success', data });
      },
    });
  });

  return (
    <Form {...form} labelDirection={labelDirection}>
      <form onSubmit={handleSubmit} className="space-y-6">
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
        <Separator />
        <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
          <BlockNoteContent
            control={form.control}
            name="content"
            baseBlockNoteProps={{
              id: blocknoteId.current,
              editable: isFocused || isDialog,
              members: [], // project members
              className: 'min-h-64 [&>.bn-editor]:min-h-64',
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
