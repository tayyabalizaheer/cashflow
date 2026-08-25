import { useState } from "react";
import {
  ArrowRight,
  BadgeInfo,
  Coins,
  Download,
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
import { exportLocalDatabaseBackup } from "../lib/localsqlite";

type BackupProgress = {
  percent: number;
  message: string;
};

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void> | void;
      close: () => Promise<void> | void;
    }>;
  }>;
};

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
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(
    null,
  );
  const [backupError, setBackupError] = useState("");
  const [backupDone, setBackupDone] = useState("");

  async function updateAndRestart() {
    setRestarting(true);
    await clearAppCacheAndRestart();
  }

  function backupFileName() {
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    return `cash-flow-local-${stamp}.bak`;
  }

  function waitForPaint() {
    return new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  async function saveBackupFile(fileName: string, bytes: Uint8Array) {
    const backupBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(backupBuffer).set(bytes);
    const blob = new Blob([backupBuffer], {
      type: "application/x-sqlite3",
    });
    const pickerWindow = window as SaveFilePickerWindow;

    if (pickerWindow.showSaveFilePicker) {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Cash Flow backup",
            accept: { "application/octet-stream": [".bak"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function takeBackup() {
    setBackupError("");
    setBackupDone("");
    const fileName = backupFileName();

    try {
      setBackupProgress({ percent: 15, message: "Reading local database" });
      await waitForPaint();
      const bytes = await exportLocalDatabaseBackup();
      setBackupProgress({ percent: 65, message: "Preparing backup file" });
      await waitForPaint();
      await saveBackupFile(fileName, bytes);
      setBackupProgress({ percent: 100, message: "Backup saved" });
      setBackupDone(fileName);
      window.setTimeout(() => setBackupProgress(null), 1200);
    } catch (error) {
      setBackupProgress(null);
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setBackupError(
        error instanceof Error ? error.message : "Could not take backup.",
      );
    }
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
        <section className="settings-tile backup-settings-tile">
          <span className="settings-tile-icon">
            <Download size={22} />
          </span>
          <span>
            <strong>Backup and restore</strong>
            <small>
              Save a local .bak copy of this device database. No server call is
              made.
            </small>
          </span>
          <button
            className="primary-button compact"
            type="button"
            onClick={takeBackup}
            disabled={Boolean(backupProgress)}
          >
            <Download size={16} />
            {backupProgress ? "Backing up" : "Take backup"}
          </button>
          {backupProgress ? (
            <div className="backup-progress">
              <div>
                <span>{backupProgress.message}</span>
                <strong>{backupProgress.percent}%</strong>
              </div>
              <progress value={backupProgress.percent} max={100} />
            </div>
          ) : null}
          {backupDone ? (
            <small className="backup-status">Saved {backupDone}</small>
          ) : null}
          {backupError ? (
            <small className="backup-status error">{backupError}</small>
          ) : null}
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
