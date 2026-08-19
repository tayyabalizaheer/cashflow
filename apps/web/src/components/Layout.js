import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Banknote, Building2, Calculator, ChartPie, CircleDollarSign, Landmark, LogOut, Settings, WalletCards } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";
const items = [
    { to: "/", label: "Dashboard", icon: ChartPie },
    { to: "/expenses", label: "Expenses", icon: WalletCards },
    { to: "/loans", label: "Loans", icon: Banknote },
    { to: "/investments", label: "Invest", icon: CircleDollarSign },
    { to: "/assets", label: "Assets", icon: Building2 },
    { to: "/zakat", label: "Zakat", icon: Calculator },
    { to: "/profile", label: "Profile", icon: Settings }
];
export function Layout() {
    const { user, logout } = useAuth();
    return (_jsxs("div", { className: "shell", children: [_jsxs("aside", { className: "sidebar", "aria-label": "Primary", children: [_jsxs(NavLink, { to: "/", className: "brand", "aria-label": "Cash Flow dashboard", children: [_jsx(Landmark, { size: 28 }), _jsx("span", { children: "Cash Flow" })] }), _jsx("nav", { className: "nav-list", children: items.map((item) => (_jsxs(NavLink, { to: item.to, className: ({ isActive }) => (isActive ? "nav-item active" : "nav-item"), children: [_jsx(item.icon, { size: 19 }), _jsx("span", { children: item.label })] }, item.to))) }), _jsxs("div", { className: "sidebar-footer", children: [_jsxs("div", { children: [_jsx("strong", { children: user?.fullName ?? "Guest" }), _jsx("span", { children: user?.email ?? "Not signed in" })] }), _jsx("button", { className: "icon-button", onClick: logout, title: "Log out", children: _jsx(LogOut, { size: 18 }) })] })] }), _jsx("main", { className: "main-panel", children: _jsx(Outlet, {}) }), _jsx("nav", { className: "bottom-nav", "aria-label": "Primary mobile", children: items.slice(0, 5).map((item) => (_jsxs(NavLink, { to: item.to, className: ({ isActive }) => (isActive ? "bottom-item active" : "bottom-item"), children: [_jsx(item.icon, { size: 20 }), _jsx("span", { children: item.label })] }, item.to))) })] }));
}
