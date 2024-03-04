// TODO: How to make this util function more type safe?
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const toggleExpand = (changedRows: any, indexes: number[]) => {
  let rows = [...changedRows];
  const row = rows[indexes[0]];

  if (row.type === 'MASTER') {
    if (row.expanded) {
      const detailId = `${row.id}-detail`;
      rows.splice(indexes[0] + 1, 0, {
        type: 'DETAIL',
        id: detailId,
        parent: row,
      });

      // Close other masters
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      rows = rows.map((r: any) => {
        if (r.type === 'MASTER' && r.id === row.id) {
          return r;
        }
        return {
          ...r,
          expanded: false,
        };
      });

      // Remove other details
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      rows = rows.filter((r: any) => r.type === 'MASTER' || r.id === detailId);
    } else {
      rows.splice(indexes[0] + 1, 1);
    }
  }

  return rows;
};
