import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function StatCard({ label, value, tone = "neutral", note }) {
    return (_jsxs("section", { className: `stat-card ${tone}`, children: [_jsx("span", { children: label }), _jsx("strong", { children: value }), note ? _jsx("small", { children: note }) : null] }));
}
