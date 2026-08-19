import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { RecordTable } from "../components/RecordTable";
import { api, formatCurrency } from "../lib/api";
const config = {
    expenses: {
        title: "Expenses",
        endpoint: "/expenses",
        empty: "No expenses yet. Add your first expense from the API or connect the form flow.",
        columns: [
            { key: "purpose", label: "Purpose" },
            { key: "amount", label: "Amount", render: (row) => formatCurrency(row.amount ?? 0, row.currency) },
            { key: "currency", label: "Currency" }
        ]
    },
    loans: {
        title: "Loans",
        endpoint: "/loans",
        empty: "No loans yet. Receivables and payables will appear here.",
        columns: [
            { key: "person", label: "Person" },
            { key: "amount", label: "Amount", render: (row) => formatCurrency(row.amount ?? 0, row.currency) },
            { key: "status", label: "Status" }
        ]
    },
    investments: {
        title: "Investments",
        endpoint: "/investments",
        empty: "No investments yet. Add cost basis, quantity, and NAV to track value.",
        columns: [
            { key: "name", label: "Name" },
            { key: "type", label: "Type" },
            { key: "amountInvested", label: "Cost", render: (row) => formatCurrency(row.amountInvested ?? 0, row.currency) }
        ]
    },
    assets: {
        title: "Assets",
        endpoint: "/assets",
        empty: "No assets yet. Cash, gold, property, vehicles, and other assets belong here.",
        columns: [
            { key: "name", label: "Name" },
            { key: "assetType", label: "Type" },
            { key: "value", label: "Value", render: (row) => formatCurrency(row.value ?? 0, row.currency) }
        ]
    }
};
export function RecordsPage({ module }) {
    const page = config[module];
    const { data, error, isLoading } = useQuery({
        queryKey: [module],
        queryFn: () => api(page.endpoint)
    });
    return (_jsxs("section", { className: "page", children: [_jsxs("header", { className: "page-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Manage" }), _jsx("h1", { children: page.title })] }), _jsxs("div", { className: "filter-bar", children: [_jsx("input", { "aria-label": "Search", placeholder: "Search" }), _jsxs("select", { "aria-label": "Currency filter", children: [_jsx("option", { children: "All currencies" }), _jsx("option", { children: "USD" }), _jsx("option", { children: "AED" }), _jsx("option", { children: "SAR" })] }), _jsx("button", { className: "primary-button compact", children: "Add" })] })] }), error ? _jsxs("div", { className: "form-error", children: ["Could not load ", page.title.toLowerCase(), "."] }) : null, isLoading ? _jsxs("div", { className: "empty-state", children: ["Loading ", page.title.toLowerCase(), "..."] }) : null, _jsx(RecordTable, { columns: page.columns, rows: data?.data ?? [], emptyLabel: page.empty })] }));
}
