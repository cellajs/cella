import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { infoQueryOptions } from '~/modules/docs/query';
import { Card, CardContent } from '~/modules/ui/card';

/** The API's facts as label and value rows. A plain table: each label is its row's header, which a grid cell cannot be. */
export function OverviewTable() {
  const { t } = useTranslation();

  const { data: info } = useSuspenseQuery(infoQueryOptions);

  const rows = [
    { key: 'title', label: t('c:title'), value: info.title },
    { key: 'version', label: t('c:version'), value: info.version },
    { key: 'description', label: t('c:description'), value: info.description },
    { key: 'openapiVersion', label: t('c:docs.openapi_version'), value: info.openapiVersion },
    { key: 'documentedOps', label: t('c:docs.documented_operations'), value: String(info.documentedOperationCount) },
    { key: 'hiddenOps', label: t('c:docs.hidden_operations'), value: String(info.hiddenOperationCount) },
  ];

  return (
    <Card className="mb-12 border-0">
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(({ key, label, value }) => (
              <tr key={key} className="border-b">
                <th scope="row" className="w-50 py-3 pr-4 text-left align-top font-medium">
                  {label}
                </th>
                <td className="py-3 text-muted-foreground leading-5">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
