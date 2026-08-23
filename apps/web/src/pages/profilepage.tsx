import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ThemePreference, useTheme } from "../components/themeprovider";

type ProfilePreferences = {
  baseCurrency: string;
  locale: string;
  timeZone: string;
  theme: ThemePreference;
};

type Profile = {
  fullName: string;
  email: string;
  preferences?: ProfilePreferences;
};

type ProfileForm = {
  fullName: string;
  baseCurrency: string;
  locale: string;
  timeZone: string;
  theme: ThemePreference;
};

function emptyProfileForm(theme: ThemePreference): ProfileForm {
  return {
    fullName: "",
    baseCurrency: "USD",
    locale: "en-US",
    timeZone: "UTC",
    theme,
  };
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { themePreference, setThemePreference } = useTheme();
  const [form, setForm] = useState<ProfileForm>(() =>
    emptyProfileForm(themePreference),
  );

  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api<{ data: Profile }>("/profile"),
  });
  const profile = data?.data;

  const updateProfile = useMutation({
    mutationFn: (payload: ProfileForm) =>
      api<{ data: Profile }>("/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(["profile"], response);
      setThemePreference(response.data.preferences?.theme ?? form.theme);
    },
  });

  useEffect(() => {
    if (!profile) return;
    const nextTheme = profile.preferences?.theme ?? themePreference;
    setForm({
      fullName: profile.fullName,
      baseCurrency: profile.preferences?.baseCurrency ?? "USD",
      locale: profile.preferences?.locale ?? "en-US",
      timeZone: profile.preferences?.timeZone ?? "UTC",
      theme: nextTheme,
    });
    setThemePreference(nextTheme);
  }, [profile]);

  function updateField<K extends keyof ProfileForm>(
    key: K,
    value: ProfileForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "theme") setThemePreference(value as ThemePreference);
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateProfile.mutate({
      ...form,
      baseCurrency: form.baseCurrency.toUpperCase(),
    });
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Profile settings</h1>
        </div>
      </header>
      <form className="form-card settings-form" onSubmit={submitProfile}>
        <label>
          Full name
          <input
            value={form.fullName}
            onChange={(event) => updateField("fullName", event.target.value)}
            required
            minLength={2}
          />
        </label>
        <label>
          Email
          <input value={profile?.email ?? ""} disabled />
        </label>
        <label>
          Base currency
          <input
            value={form.baseCurrency}
            onChange={(event) =>
              updateField("baseCurrency", event.target.value)
            }
            maxLength={3}
            required
          />
        </label>
        <label>
          Locale
          <input
            value={form.locale}
            onChange={(event) => updateField("locale", event.target.value)}
            required
          />
        </label>
        <label>
          Time zone
          <input
            value={form.timeZone}
            onChange={(event) => updateField("timeZone", event.target.value)}
            required
          />
        </label>
        <label>
          Theme
          <select
            value={form.theme}
            onChange={(event) =>
              updateField("theme", event.target.value as ThemePreference)
            }
          >
            <option value="system">System default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        {updateProfile.error ? (
          <div className="form-error">{updateProfile.error.message}</div>
        ) : null}
        <button className="primary-button" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Saving" : "Save changes"}
        </button>
      </form>
    </section>
  );
}
