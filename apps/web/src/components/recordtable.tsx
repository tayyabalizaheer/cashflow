import { Archive, Pencil } from "lucide-react";

export type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
};

export function RecordTable<T extends { id: string }>({
  columns,
  rows,
  emptyLabel
}: {
  columns: Column<T>[];
  rows: T[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)}>{column.label}</th>
            ))}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={String(column.key)}>
                  {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key as string] ?? "")}
                </td>
              ))}
              <td className="row-actions">
                <button className="icon-button" title="Edit">
                  <Pencil size={16} />
                </button>
                <button className="icon-button danger" title="Archive">
                  <Archive size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
