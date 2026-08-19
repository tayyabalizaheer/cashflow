import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
export function NotFoundPage() {
    return (_jsx("main", { className: "center-page", children: _jsxs("section", { className: "form-card", children: [_jsx("p", { className: "eyebrow", children: "404" }), _jsx("h1", { children: "Page not found" }), _jsx("p", { children: "The page may have moved or you may not have access to it." }), _jsx(Link, { className: "primary-button", to: "/", children: "Go to dashboard" })] }) }));
}
