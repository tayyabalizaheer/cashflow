import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OfflinePage } from "./pages/OfflinePage";
import { ProfilePage } from "./pages/ProfilePage";
import { RecordsPage } from "./pages/RecordsPage";
import { ZakatPage } from "./pages/ZakatPage";
import { useOnlineSync } from "./lib/useOnlineSync";
function Protected() {
    const { user } = useAuth();
    useOnlineSync(Boolean(user));
    if (!user)
        return _jsx(Navigate, { to: "/login", replace: true });
    return _jsx(Layout, {});
}
export default function App() {
    return (_jsx(AuthProvider, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(AuthPage, {}) }), _jsx(Route, { path: "/offline", element: _jsx(OfflinePage, {}) }), _jsxs(Route, { element: _jsx(Protected, {}), children: [_jsx(Route, { index: true, element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "expenses", element: _jsx(RecordsPage, { module: "expenses" }) }), _jsx(Route, { path: "loans", element: _jsx(RecordsPage, { module: "loans" }) }), _jsx(Route, { path: "investments", element: _jsx(RecordsPage, { module: "investments" }) }), _jsx(Route, { path: "assets", element: _jsx(RecordsPage, { module: "assets" }) }), _jsx(Route, { path: "zakat", element: _jsx(ZakatPage, {}) }), _jsx(Route, { path: "profile", element: _jsx(ProfilePage, {}) })] }), _jsx(Route, { path: "*", element: _jsx(NotFoundPage, {}) })] }) }));
}
