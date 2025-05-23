/**
 * Parses Prometheus-style metrics from a text string, extracting labels and their values
 * for a specified metric name.
 *
 * @param text - Raw metrics text, typically exported from Prometheus.
 * @param metricName - The name of the metric to search for in the text.
 * @returns An array of objects representing the labels of each metric, with the labels as key-value pairs.
 */
export const parsePromMetrics = (text: string, metricName: string): Record<string, string | number>[] => {
  // Split the text into lines, trim each line, and keep only the ones starting with the metricName
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(metricName));

  // Process each line that starts with the metricName to extract labels
  return lines
    .map((line) => {
      const match = line.match(/{([^}]*)}/);
      if (!match) return null;

      // Extract the part containing the labels from the match
      const [, labels] = match;

      // Transform the labels into valid JSON
      const jsonString = `{${labels.replace(/(\w+)=/g, '"$1":')}}`;

      try {
        return JSON.parse(jsonString);
      } catch (err) {
        return null; // If parsing fails, return null
      }
    })
    .filter((metric) => metric !== null);
};
