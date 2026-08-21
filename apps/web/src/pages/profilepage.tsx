import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function ProfilePage() {
  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api<{ data: { fullName: string; email: string; preferences?: { baseCurrency: string; locale: string; timeZone: string; theme: string } } }>("/profile")
  });
  const profile = data?.data;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Profile settings</h1>
        </div>
      </header>
      <form className="form-card settings-form">
        <label>
          Full name
          <input defaultValue={profile?.fullName ?? ""} />
        </label>
        <label>
          Email
          <input defaultValue={profile?.email ?? ""} disabled />
        </label>
        <label>
          Base currency
          <input defaultValue={profile?.preferences?.baseCurrency ?? "USD"} maxLength={3} />
        </label>
        <label>
          Locale
          <input defaultValue={profile?.preferences?.locale ?? "en-US"} />
        </label>
        <label>
          Time zone
          <input defaultValue={profile?.preferences?.timeZone ?? "UTC"} />
        </label>
        <label>
          Theme
          <select defaultValue={profile?.preferences?.theme ?? "system"}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button className="primary-button" type="button">
          Save changes
        </button>
      </form>
    </section>
  );
}
