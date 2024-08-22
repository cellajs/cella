import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { getMetrics } from '~/api/general';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { type ChartConfig, ChartContainer } from '~/modules/ui/chart';

export const description = 'An interactive bar chart';

const chartConfig = {
  views: {
    label: 'Page Views',
  },
  count: {
    label: 'count',
  },
} satisfies ChartConfig;

export function RequestsPerMinute() {
  const [metrics, setMetrics] = useState<Record<string, number>[]>([]);

  useEffect(() => {
    getMetrics().then((data) => setMetrics(data));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
          <CardTitle>Metric chart</CardTitle>
          <CardDescription>Requests per minute</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <BarChart accessibilityLayer data={metrics}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickMargin={6}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                });
              }}
            />
            <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
