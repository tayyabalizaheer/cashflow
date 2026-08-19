import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { zakatDisclaimer } from "@cash-flow/shared";
import { useState } from "react";
import { formatCurrency } from "../lib/api";
export function ZakatPage() {
    const [assets, setAssets] = useState(10000);
    const [investments, setInvestments] = useState(4000);
    const [liabilities, setLiabilities] = useState(1200);
    const [nisab, setNisab] = useState(5500);
    const [rate, setRate] = useState(2.5);
    const wealth = Math.max(assets + investments - liabilities, 0);
    const thresholdMet = wealth >= nisab;
    const due = thresholdMet ? wealth * (rate / 100) : 0;
    return (_jsxs("section", { className: "page", children: [_jsx("header", { className: "page-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Transparent estimate" }), _jsx("h1", { children: "Zakat calculator" })] }) }), _jsxs("section", { className: "calculator-grid", children: [_jsxs("form", { className: "form-card compact-form", children: [_jsxs("label", { children: ["Eligible assets and cash", _jsx("input", { type: "number", value: assets, onChange: (event) => setAssets(Number(event.target.value)) })] }), _jsxs("label", { children: ["Eligible investments", _jsx("input", { type: "number", value: investments, onChange: (event) => setInvestments(Number(event.target.value)) })] }), _jsxs("label", { children: ["Deductible short-term liabilities", _jsx("input", { type: "number", value: liabilities, onChange: (event) => setLiabilities(Number(event.target.value)) })] }), _jsxs("label", { children: ["Nisab threshold", _jsx("input", { type: "number", value: nisab, onChange: (event) => setNisab(Number(event.target.value)) })] }), _jsxs("label", { children: ["Rate", _jsx("input", { type: "number", step: "0.1", value: rate, onChange: (event) => setRate(Number(event.target.value)) })] })] }), _jsxs("aside", { className: "zakat-result", children: [_jsx("span", { className: thresholdMet ? "status-pill good" : "status-pill", children: thresholdMet ? "Nisab met" : "Below nisab" }), _jsx("strong", { children: formatCurrency(due, "USD") }), _jsxs("p", { children: ["Zakatable wealth: ", formatCurrency(wealth, "USD")] }), _jsx("small", { children: zakatDisclaimer })] })] })] }));
}
