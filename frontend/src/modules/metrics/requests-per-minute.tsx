import { queryOptions, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { getMetrics } from '~/api.gen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { type ChartConfig, ChartContainer } from '~/modules/ui/chart';

const chartConfig = {
  views: { label: 'Page Views' },
  count: { label: 'count' },
} satisfies ChartConfig;

function RequestsPerMinute() {
  const { t } = useTranslation();

  const queryParams = queryOptions({
    queryKey: ['metrics'],
    queryFn: () => getMetrics(),
    staleTime: 0,
  });

  const { data: metrics } = useQuery(queryParams);

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <CardTitle>{t('common:requests')}</CardTitle>
          <CardDescription>{t('common:requests.text')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <BarChart accessibilityLayer data={metrics}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickMargin={6}
              tickFormatter={(value) => new Date(value).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' })}
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export default RequestsPerMinute;
