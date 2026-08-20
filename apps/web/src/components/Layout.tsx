import {
  Banknote,
  Building2,
  Calculator,
  ChartPie,
  CircleDollarSign,
  LogOut,
  Settings,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

const items = [
  { to: "/", label: "Dashboard", icon: ChartPie },
  { to: "/expenses", label: "Expenses", icon: WalletCards },
  { to: "/loans", label: "Loans", icon: Banknote },
  { to: "/investments", label: "Invest", icon: CircleDollarSign },
  { to: "/stocks", label: "Stocks", icon: TrendingUp },
  { to: "/assets", label: "Assets", icon: Building2 },
  { to: "/zakat", label: "Zakat", icon: Calculator },
  { to: "/settings", label: "Settings", icon: Settings }
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Primary">
        <NavLink to="/" className="brand" aria-label="Cash Flow dashboard">
          <img src="/icons/icon-192.png" alt="" />
          <span>Cash Flow</span>
        </NavLink>
        <nav className="nav-list">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
              <item.icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>
            <strong>{user?.fullName ?? "Guest"}</strong>
            <span>{user?.email ?? "Not signed in"}</span>
          </div>
          <button className="icon-button" onClick={logout} title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Primary mobile">
        {items.slice(0, 5).map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "bottom-item active" : "bottom-item")}>
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
