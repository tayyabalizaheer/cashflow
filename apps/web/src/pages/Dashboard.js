import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer } from "recharts";
import { StatCard } from "../components/StatCard";
import { api, formatCurrency } from "../lib/api";
export function Dashboard() {
    const chartColors = ["#0f5f5c", "#f4c95d", "#5b6f95", "#b1465a"];
    const { data, isLoading, error } = useQuery({
        queryKey: ["dashboard"],
        queryFn: () => api("/dashboard")
    });
    const dashboard = data?.data;
    const chartData = dashboard
        ? Object.entries(dashboard.counts).map(([name, value]) => ({ name, value }))
        : [];
    return (_jsxs("section", { className: "page", children: [_jsxs("header", { className: "page-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Overview" }), _jsx("h1", { children: "Dashboard" })] }), _jsxs("div", { className: "filter-bar", children: [_jsxs("select", { "aria-label": "Date range", defaultValue: "30", children: [_jsx("option", { value: "30", children: "Last 30 days" }), _jsx("option", { value: "90", children: "Last 90 days" }), _jsx("option", { value: "365", children: "This year" })] }), _jsx("select", { "aria-label": "Currency", defaultValue: dashboard?.baseCurrency ?? "USD", children: _jsx("option", { children: dashboard?.baseCurrency ?? "USD" }) })] })] }), error ? _jsx("div", { className: "form-error", children: "Dashboard could not load. Check the API connection." }) : null, _jsxs("div", { className: "stat-grid", children: [_jsx(StatCard, { label: "Expenses", value: String(dashboard?.counts.expenses ?? 0), note: "Records in scope" }), _jsx(StatCard, { label: "Loans", value: String(dashboard?.counts.loans ?? 0), tone: "warn", note: "Receivable and payable" }), _jsx(StatCard, { label: "Investments", value: String(dashboard?.counts.investments ?? 0), tone: "good", note: "NAV-aware" }), _jsx(StatCard, { label: "Estimated Zakat", value: dashboard?.latestZakat
                            ? formatCurrency(dashboard.latestZakat.estimatedZakatDue, dashboard.latestZakat.currency)
                            : "Not calculated", tone: "neutral", note: "Estimate only" })] }), _jsxs("section", { className: "work-surface", children: [_jsxs("div", { children: [_jsx("h2", { children: "Record mix" }), _jsx("p", { children: isLoading ? "Loading records..." : dashboard?.currencyNote ?? "Sign in to load your records." })] }), _jsx("div", { className: "chart-box", "aria-label": "Financial record mix chart", children: _jsx(ResponsiveContainer, { width: "100%", height: 260, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: chartData, dataKey: "value", nameKey: "name", innerRadius: 58, outerRadius: 92, paddingAngle: 3, children: chartData.map((entry, index) => (_jsx(Cell, { fill: chartColors[index % chartColors.length] ?? "#0f5f5c" }, entry.name))) }), _jsx(Legend, {})] }) }) })] })] }));
}
