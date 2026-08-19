import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Archive, Pencil } from "lucide-react";
export function RecordTable({ columns, rows, emptyLabel }) {
    if (rows.length === 0) {
        return _jsx("div", { className: "empty-state", children: emptyLabel });
    }
    return (_jsx("div", { className: "table-wrap", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [columns.map((column) => (_jsx("th", { children: column.label }, String(column.key)))), _jsx("th", { "aria-label": "Actions" })] }) }), _jsx("tbody", { children: rows.map((row) => (_jsxs("tr", { children: [columns.map((column) => (_jsx("td", { children: column.render ? column.render(row) : String(row[column.key] ?? "") }, String(column.key)))), _jsxs("td", { className: "row-actions", children: [_jsx("button", { className: "icon-button", title: "Edit", children: _jsx(Pencil, { size: 16 }) }), _jsx("button", { className: "icon-button danger", title: "Archive", children: _jsx(Archive, { size: 16 }) })] })] }, row.id))) })] }) }));
}
