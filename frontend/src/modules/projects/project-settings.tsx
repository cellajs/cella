import { useNavigate, useParams } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { dialog } from '../common/dialoger/state';
import { toast } from 'sonner';
import { sheet } from '~/modules/common/sheeter/state';
import UpdateProjectForm from './update-project';
import DeleteProjects from './delete-project';

const projectPlug = [
  {
    id: 'string;',
    slug: 'string;',
    name: 'string;',
    organizationId: 'string;',
    workspaceId: 'string;',
  },
];

export const ProjectSettings = ({ sheet: isSheet }: { sheet?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { idOrSlug }: { idOrSlug: string } = useParams({ strict: false });

  const openDeleteDialog = () => {
    dialog(
      <DeleteProjects
        dialog
        projects={projectPlug}
        callback={() => {
          toast.success(t('common:success.delete_Project'));
          sheet.remove('Project_settings');
          navigate({ to: '/', replace: true });
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_project'),
        text: t('common:confirm.delete_project', { name: 'SETPROJECTNAME' }),
      },
    );
  };
  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>{t('common:general')}</CardTitle>
        </CardHeader>
        <CardContent>
          <UpdateProjectForm
            project={projectPlug[0]}
            callback={(project) => {
              if (idOrSlug !== project.slug) {
                // navigate({
                //   to: '/Project/$idOrSlug/board',
                //   params: { idOrSlug: project.slug },
                //   replace: true,
                // });
              }
            }}
            sheet={isSheet}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('common:delete_project')}</CardTitle>
          <CardDescription>
            <Trans i18nKey="common:delete_project_notice.text" values={{ name: 'SETPROJECTNAME' }} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{t('common:delete_project')}</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
