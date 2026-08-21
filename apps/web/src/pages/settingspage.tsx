import { ArrowRight, Coins, LogOut, Trash2, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../components/authprovider";

const settingsTiles = [
  {
    to: "/settings/profile",
    title: "Profile settings",
    description: "Name, email, locale, time zone, theme, and account preferences.",
    icon: UserRound
  },
  {
    to: "/settings/currencies",
    title: "Currency settings",
    description: "Choose the currencies you use for expenses, loans, assets, and reports.",
    icon: Coins
  },
  {
    to: "/settings/trash",
    title: "Trash",
    description: "Restore deleted records or remove them permanently.",
    icon: Trash2
  }
];

export function SettingsPage() {
  const { logout } = useAuth();

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Settings</h1>
        </div>
      </header>
      <div className="settings-tile-grid">
        {settingsTiles.map((tile) => (
          <NavLink className="settings-tile" key={tile.to} to={tile.to}>
            <span className="settings-tile-icon">
              <tile.icon size={22} />
            </span>
            <span>
              <strong>{tile.title}</strong>
              <small>{tile.description}</small>
            </span>
            <ArrowRight size={18} />
          </NavLink>
        ))}
        <button className="settings-tile settings-logout-tile" type="button" onClick={logout}>
          <span className="settings-tile-icon danger-icon">
            <LogOut size={22} />
          </span>
          <span>
            <strong>Log out</strong>
            <small>Sign out of this device.</small>
          </span>
        </button>
      </div>
    </section>
  );
}
