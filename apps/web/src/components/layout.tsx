import {
  Banknote,
  Building2,
  Calculator,
  ChartPie,
  CircleDollarSign,
  MoreHorizontal,
  Settings,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "./authprovider";

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

const mobileMainItems = items.slice(0, 4);
const mobileMoreItems = items.slice(4);

export function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreIsActive = mobileMoreItems.some((item) =>
    item.to === "/"
      ? location.pathname === item.to
      : location.pathname.startsWith(item.to),
  );

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
        </div>
      </aside>

      <main className="main-panel">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Primary mobile">
        {mobileMainItems.map((item) => (
          <NavLink key={item.to} to={item.to} onClick={() => setShowMoreMenu(false)} className={({ isActive }) => (isActive ? "bottom-item active" : "bottom-item")}>
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <div className="bottom-more-wrap">
          <button
            className={moreIsActive || showMoreMenu ? "bottom-item active" : "bottom-item"}
            type="button"
            onClick={() => setShowMoreMenu((current) => !current)}
            aria-expanded={showMoreMenu}
            aria-haspopup="menu"
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
          {showMoreMenu ? (
            <div className="bottom-more-menu" role="menu">
              {mobileMoreItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  onClick={() => setShowMoreMenu(false)}
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  <item.icon size={17} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
