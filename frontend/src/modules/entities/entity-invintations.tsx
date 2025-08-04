import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';
import { getEntityRoute } from '~/nav-config';
import { dateShort } from '~/utils/date-short';
import { AvatarWrap } from '../common/avatar-wrap';
import { ExpandableList } from '../common/expandable-list';
import type { EntityListItem } from '../navigation/search';
import { Button } from '../ui/button';
import UserCell from '../users/user-cell';

const invites = [
  {
    id: 'dasfdsfgsdgfsd',
    entity: {
      color: '#4c1cd8',
      country: 'Comoros',
      createdAt: '2025-07-12 14:59:34.071',
      entityType: 'organization',
      id: '_5n6sJGbUFfCz7b6N_TPc',
      logoUrl: 'https://picsum.photos/seed/XTl5Ad/3369/1313',
      name: 'Wintheiser, Altenwerth and Little',
      slug: 'wintheiser-altenwerth-and-little',
      thumbnailUrl: null,
    },
    invitedBy: {
      createdAt: '2025-08-01 11:53:36.445',
      email: 'zelda_erdman@yahoo.com',
      entityType: 'user',
      firstName: 'Zelda',
      id: '2hZE9ix-vjWli5dcQDSbm',
      language: 'en',
      lastName: 'Erdman',
      name: 'Zelda Erdman MD',
      role: 'user',
      slug: 'zeldaerdman27',
      thumbnailUrl: null,
    },
    expiresIn: '2025-11-12 14:59:34.071',
  },
  {
    id: '312',
    entity: {
      color: '#4c1cd8',
      country: 'Comoros',
      createdAt: '2025-07-12 14:59:34.071',
      entityType: 'organization',
      id: '31213e2das',
      logoUrl: 'https://picsum.photos/seed/KUYhQ1Ry/2008/1376',
      name: 'Lebsack, Fadel and Haley',
      slug: 'wintheiser-altenwerth-little',
      thumbnailUrl: null,
    },
    invitedBy: {
      createdAt: '2025-08-01 11:53:36.445',
      email: 'megane.schroeder@hotmail.com',
      entityType: 'user',
      firstName: 'Megane',
      id: '"GNLMp-TSnjFZAzMwAFWSF"-vjWli5dcQDSbm',
      language: 'en',
      lastName: 'Schroeder',
      name: 'Megane Schroeder I',
      role: 'user',
      slug: 'zeldaerdman27',
      thumbnailUrl: null,
    },
    expiresIn: '2025-09-30 14:59:34.071',
  },
  {
    id: '43243223',
    entity: {
      color: '#4c1cd8',
      country: 'Comoros',
      createdAt: '2025-07-12 14:59:34.071',
      entityType: 'organization',
      id: '2z3o-vT8UTI_48NZtVsqc',
      logoUrl: 'https://loremflickr.com/3748/479?lock=4180348277071028',
      name: 'Greenholt, Harris and Stehr',
      slug: 'altenwerth-and-little',
      organizationId: undefined,
      thumbnailUrl: null,
    },
    invitedBy: {
      createdAt: '2025-08-01 11:53:36.445',
      email: 'cesar.bauch14@gmail.com',
      entityType: 'user',
      firstName: 'Cesar',
      id: 'uSDIJpjciW3Y-pWLyB-mz',
      language: 'en',
      lastName: 'Bauch',
      name: 'Zelda Erdman MD',
      role: 'user',
      slug: 'zeldae3123123rdman27',
      thumbnailUrl: null,
    },
    expiresIn: new Date(),
  },
  {
    id: '312ewds',
    entity: {
      color: '#4c1cd8',
      country: 'Comoros',
      createdAt: '2025-07-12 14:59:34.071',
      entityType: 'organization',
      id: 'oROzFij_n8QjmP761SP3V',
      logoUrl: 'https://loremflickr.com/2482/3093?lock=7452394302886934',
      name: 'Wisoky, Waters and Hauck',
      slug: 'wintheiser-and-little',
      thumbnailUrl: null,
    },
    invitedBy: {
      createdAt: '2025-08-01 11:53:36.445',
      email: 'zelda_erdman@yahoo.com',
      entityType: 'user',
      firstName: 'Zelda',
      id: '2hZE9ix-vjWli5dcQDSbm',
      language: 'en',
      lastName: 'Erdman',
      name: 'Cesar Bauch Jr.',
      role: 'user',
      slug: 'zeldaerdman27',
      thumbnailUrl: null,
    },
    expiresIn: '2025-07-12 14:59:34.071',
  },
];

export const EntityInvites = () => {
  const { t } = useTranslation();
  return (
    <Card className="mt-6">
      <CardHeader className="p-4 border-b">
        <CardTitle>{t('common:pending_invitations')}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-4 font-medium text-sm p-2 border-b">
            <span>{t('common:entity')}</span>
            <span>{t('common:invited_by')}</span>
            <span>{t('common:expires_at')}</span>
            <span className="ml-auto">{t('common:action')}</span>
          </div>
          <ExpandableList
            items={invites}
            renderItem={({ entity, invitedBy, expiresIn }) => {
              const { to, params, search } = getEntityRoute(entity as unknown as EntityListItem);
              return (
                <div className="grid grid-cols-4 col-end- items-center gap-4 py-2">
                  <Link to={to} params={params} search={search} draggable="false" className="flex space-x-2 items-center outline-0 ring-0 group">
                    <AvatarWrap
                      type="organization"
                      className="h-10 w-10 group-active:translate-y-[.05rem] group-hover:font-semibold"
                      id={entity.id}
                      name={entity.name}
                      url={entity.logoUrl}
                    />
                    <span className="group-hover:underline underline-offset-3 decoration-foreground/20 group-active:decoration-foreground/50 group-active:translate-y-[.05rem] truncate font-medium">
                      {entity.name}
                    </span>
                  </Link>
                  <UserCell user={{ ...invitedBy, entityType: 'user' }} tabIndex={0} />
                  <span>{new Date(expiresIn) < new Date() ? 'Expired' : dateShort(expiresIn)}</span>
                  <Button size="xs" className="w-[60%] ml-auto" variant="darkSuccess">
                    {t('common:retry')}
                  </Button>
                </div>
              );
            }}
            initialDisplayCount={2}
            expandText="common:all_invites"
          />
        </div>
      </CardContent>
    </Card>
  );
};
