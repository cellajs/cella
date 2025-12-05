import { zodResolver } from '@hookform/resolvers/zod';
import { SaveIcon } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPage, type Page } from '~/api.gen';
import { zCreatePageData } from '~/api.gen/zod.gen';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import BlockNoteContent from '~/modules/common/form-fields/blocknote-content';
import Spinner from '~/modules/common/spinner';
import { useTableMutation } from '~/modules/pages/utils/mutations';
import { Form, type LabelDirectionType } from '~/modules/ui/form';
import { useUserStore } from '~/store/user';
import { blocknoteFieldIsDirty } from '~/utils/blocknote-field-is-dirty';
import { nanoid } from '~/utils/nanoid';
import { CallbackArgs } from '../common/data-table/types';
import InputFormField from '../common/form-fields/input';
import { toaster } from '../common/toaster/service';
import { Button, SubmitButton } from '../ui/button';
import { Separator } from '../ui/separator';

// type FormValues = z.infer<typeof schema>;
const schema = zCreatePageData.shape.body;

type CreatePageFormProps = {
  organizationId: string;
  callback?: (args: CallbackArgs<Page>) => void;
  isDialog?: boolean;
  labelDirection?: LabelDirectionType;
  // children?: React.ReactNode;
};

type PageData = Partial<Page> & Pick<Page, 'name' | 'description' | 'keywords'>;

// TODO can we get this derived from zod schema?
const prepareCreatePage = (pageData: PageData, createdBy: string): Page => {
  const createdAt = new Date().toISOString();
  return {
    id: nanoid(),
    entityType: 'page',
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

  const isFocused = true; // TODO grab from context?

  // TODO can we offload this to the blocknote component
  const blocknoteId = useRef(`blocknote-${nanoid()}`);

  const formContainerId = 'create-page';
  const form = useFormWithDraft(formContainerId, {
    formOptions: {
      resolver: zodResolver(schema),
      defaultValues: {
        id: nanoid(),
        name: '',
        description: '',
        keywords: '',
        status: 'unpublished',
        parentId: null,
        displayOrder: 0,
      },
    },
  });

  const isDirty = form.isDirty
    ? (() => {
        const { name, description } = form.watch();
        return [name].some((s) => s?.length) || blocknoteFieldIsDirty(description ?? '');
      })()
    : false;

  const mutation = useTableMutation({
    table: 'pages',
    type: 'create',
    mutationFn: async (body: Page) => {
      console.log(body);
      return await createPage({ body: body });
    },
  });

  const { user } = useUserStore();
  const handleSubmit = form.handleSubmit((data) => {
    // TODO
    const page = prepareCreatePage(
      {
        entityType: 'page',
        name: data.name || '',
        description: data.description,
        keywords: 'test-tag',
        status: 'unpublished',
      },
      user.id,
    );

    return mutation.mutate(page, {
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
          name="name"
          label={t('common:title')}
          // placeholder={t('common:placeholder.subject')}
          required
          inputClassName="font-bold"
        />
        <Separator />
        <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
          <BlockNoteContent
            control={form.control}
            name="description"
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
