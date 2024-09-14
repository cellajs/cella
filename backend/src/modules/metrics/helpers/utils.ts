export const parsePromMetrics = (text: string): Record<string, string | number>[] => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Requests'));

  return lines
    .map((line) => {
      // Match the pattern to extract labels
      const match = line.match(/Requests{([^}]*)}\s(\d+)/);
      if (!match) return null;
      const [, labels] = match;
      return labels.split(',').reduce<Record<string, string>>((acc, label) => {
        const [key, val] = label.split('=');
        acc[key.trim()] = val.replace(/"/g, '').trim();
        return acc;
      }, {});
    })
    .filter((metric) => metric !== null);
};

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
