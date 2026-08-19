import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
export function ProfilePage() {
    const { data } = useQuery({
        queryKey: ["profile"],
        queryFn: () => api("/profile")
    });
    const profile = data?.data;
    return (_jsxs("section", { className: "page", children: [_jsx("header", { className: "page-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Account" }), _jsx("h1", { children: "Profile and security" })] }) }), _jsxs("form", { className: "form-card settings-form", children: [_jsxs("label", { children: ["Full name", _jsx("input", { defaultValue: profile?.fullName ?? "" })] }), _jsxs("label", { children: ["Email", _jsx("input", { defaultValue: profile?.email ?? "", disabled: true })] }), _jsxs("label", { children: ["Base currency", _jsx("input", { defaultValue: profile?.preferences?.baseCurrency ?? "USD", maxLength: 3 })] }), _jsxs("label", { children: ["Locale", _jsx("input", { defaultValue: profile?.preferences?.locale ?? "en-US" })] }), _jsxs("label", { children: ["Time zone", _jsx("input", { defaultValue: profile?.preferences?.timeZone ?? "UTC" })] }), _jsxs("label", { children: ["Theme", _jsxs("select", { defaultValue: profile?.preferences?.theme ?? "system", children: [_jsx("option", { value: "system", children: "System" }), _jsx("option", { value: "light", children: "Light" }), _jsx("option", { value: "dark", children: "Dark" })] })] }), _jsx("button", { className: "primary-button", type: "button", children: "Save changes" })] })] }));
}
