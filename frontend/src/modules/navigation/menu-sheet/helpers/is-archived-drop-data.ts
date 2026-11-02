/** The data of a drop on an Archived row. */
export const archivedDropData = { menuArchivedToggle: true };

export const isArchivedDropData = (data: Record<string | symbol, unknown>) => data.menuArchivedToggle === true;
