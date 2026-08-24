import { useState } from "react";
import {
  ArrowRight,
  BadgeInfo,
  Coins,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Trash2,
  UserRound,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../components/authprovider";
import { type ThemePreference, useTheme } from "../components/themeprovider";
import {
  appDisplayVersion,
  clearAppCacheAndRestart,
  currentAppBuildNumber,
} from "../lib/appversion";

const settingsTiles = [
  {
    to: "/settings/profile",
    title: "Profile settings",
    description:
      "Name, email, locale, time zone, theme, and account preferences.",
    icon: UserRound,
  },
  {
    to: "/settings/currencies",
    title: "Currency settings",
    description:
      "Choose the currencies you use for expenses, loans, assets, and reports.",
    icon: Coins,
  },
  {
    to: "/settings/trash",
    title: "Trash",
    description: "Restore deleted records or remove them permanently.",
    icon: Trash2,
  },
];

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Monitor;
}> = [
  { value: "system", label: "System default", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function SettingsPage() {
  const { logout } = useAuth();
  const { themePreference, setThemePreference } = useTheme();
  const [restarting, setRestarting] = useState(false);

  async function updateAndRestart() {
    setRestarting(true);
    await clearAppCacheAndRestart();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Settings</h1>
        </div>
      </header>
      <div className="settings-tile-grid">
        <section className="settings-tile theme-settings-tile">
          <span className="settings-tile-icon">
            <Monitor size={22} />
          </span>
          <div>
            <strong>Theme</strong>
            <small>Choose how Cash Flow appears on this device.</small>
          </div>
          <div className="theme-option-group" role="group" aria-label="Theme">
            {themeOptions.map((option) => (
              <button
                className={
                  option.value === themePreference ? "selected" : undefined
                }
                key={option.value}
                type="button"
                onClick={() => setThemePreference(option.value)}
              >
                <option.icon size={16} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="settings-tile app-version-tile">
          <span className="settings-tile-icon">
            <BadgeInfo size={22} />
          </span>
          <span>
            <strong>App version</strong>
            <small>
              Version {appDisplayVersion} · Build {currentAppBuildNumber}
            </small>
          </span>
          <button
            className="primary-button compact"
            type="button"
            onClick={updateAndRestart}
            disabled={restarting}
          >
            <RefreshCw size={16} />
            {restarting ? "Restarting" : "Update and restart"}
          </button>
        </section>
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
        <button
          className="settings-tile settings-logout-tile"
          type="button"
          onClick={logout}
        >
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
