export const calculateRequestsPerMinute = (metrics: Record<string, string | number>[]) => {
  const requestsPerMinute = metrics.reduce<Record<string, number>>((acc, metric) => {
    const date = new Date(Number(metric.date));
    const minute = date.toISOString().slice(0, 16);
    acc[minute] = (acc[minute] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(requestsPerMinute).map(([date, count]) => ({
    date,
    count,
  }));
};
