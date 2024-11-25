export const toggleExpand = <
  T extends {
    id: string;
    _type: string;
    _expanded?: boolean;
    _parent?: { id: string };
  }[],
>(
  changedRows: T,
  indexes: number[],
) => {
  let rows = [...changedRows];
  const index = indexes[0];
  const row = rows[index];

  if (row._type === 'MASTER') {
    if (row._expanded) {
      const detailId = `${row.id}-detail`;
      rows.splice(index + 1, 0, {
        _type: 'DETAIL',
        id: detailId,
        _parent: row,
      });

      // Close other masters
      rows = rows.map((r) => {
        if (r._type === 'MASTER' && r.id === row.id) {
          return r;
        }
        return {
          ...r,
          _expanded: false,
        };
      });

      // Remove other details
      rows = rows.filter((r) => r._type === 'MASTER' || r.id === detailId);
    } else {
      rows.splice(indexes[0] + 1, 1);
    }
  }

  return rows;
};
