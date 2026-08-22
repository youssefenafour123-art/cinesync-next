"use client";

import { useState } from "react";
import { useSourcesStore, type AppSettings } from "@/store/useSourcesStore";
import { useAppStore } from "@/store/useAppStore";
import {
  setMotionPreference,
  useMotionPreference,
  type MotionPreference,
} from "@/lib/useReducedMotion";
import { Icon } from "@/components/ui/Icon";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: "person" },
  { id: "sync", label: "Sync Settings", icon: "sync" },
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "api", label: "API Integrations", icon: "api" },
] as const;

/**
 * Settings.
 *
 * The legacy panels were decorative — hardcoded "Alex Mercer", fake API keys,
 * toggles wired to nothing. Same layout, but every control now reads and
 * writes real state in localStorage.
 */
export function SettingsTab() {
  const settings = useSourcesStore((s) => s.settings);
  const updateSettings = useSourcesStore((s) => s.updateSettings);
  const sources = useSourcesStore((s) => s.sources);
  const showToast = useAppStore((s) => s.showToast);
  const [active, setActive] = useState<string>("profile");

  const stremioCount = sources.filter((s) => s.type === "stremio").length;
  const listCount = sources.filter((s) => s.type === "imdb_csv").length;

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto w-full max-w-container-max px-margin-mobile pb-16 pt-8 md:px-margin-desktop">
      <div className="mb-10">
        <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          Settings
        </h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Manage your preferences and integrations.
        </p>
      </div>

      <div className="flex flex-col gap-gutter md:flex-row">
        <aside className="w-full shrink-0 md:w-64">
          <nav className="flex flex-col gap-1 md:sticky md:top-28">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(s.id)}
                className={`flex items-center gap-4 rounded-lg px-4 py-3 font-label-md text-label-md transition-all duration-300 hover:pl-6 ${
                  active === s.id
                    ? "relative bg-primary/10 text-primary after:absolute after:left-0 after:top-1/2 after:h-1/2 after:w-1 after:-translate-y-1/2 after:rounded-r-full after:bg-primary after:shadow-[0_0_12px_rgba(78,222,163,0.6)] after:content-['']"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <Icon name={s.icon} fill={active === s.id} />
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex-1 space-y-8">
          {/* ---- Profile ---- */}
          <section id="settings-profile" className="glass-panel scroll-mt-28 rounded-lg p-6 md:p-8">
            <div className="mb-8 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div className="flex items-center gap-6">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-outline-variant bg-surface-container-high text-primary">
                  <Icon name="account_circle" className="text-[44px]" fill />
                </div>
                <div>
                  <h2 className="font-title-lg text-title-lg text-on-surface">
                    {settings.displayName || "Your Profile"}
                  </h2>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    {settings.email || "Set a display name and email below"}
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 font-label-md text-label-md text-primary shadow-[0_0_15px_rgba(78,222,163,0.15)]">
                <Icon name="workspace_premium" className="text-[18px]" />
                {stremioCount} account{stremioCount === 1 ? "" : "s"} · {listCount} list
                {listCount === 1 ? "" : "s"}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Field
                label="Display Name"
                value={settings.displayName}
                placeholder="Your name"
                onChange={(v) => updateSettings({ displayName: v })}
              />
              <Field
                label="Email Address"
                type="email"
                value={settings.email}
                placeholder="you@example.com"
                onChange={(v) => updateSettings({ email: v })}
              />
            </div>
          </section>

          {/* ---- Sync ---- */}
          <section id="settings-sync" className="glass-panel scroll-mt-28 rounded-lg p-6 md:p-8">
            <h3 className="mb-6 border-b border-white/10 pb-4 font-title-lg text-title-lg text-on-surface">
              Sync Settings
            </h3>
            <div className="space-y-6">
              <Toggle
                label="Background Auto-Sync"
                description="Re-run the sync automatically the next time you open My Library."
                checked={settings.autoSync}
                onChange={(v) => updateSettings({ autoSync: v })}
              />
              <div className="border-t border-white/5 pt-4">
                <Toggle
                  label="Push Notifications"
                  description="Show a toast when a sync finishes or an item fails."
                  checked={settings.pushNotifications}
                  onChange={(v) => updateSettings({ pushNotifications: v })}
                />
              </div>
            </div>
          </section>

          {/* ---- Appearance ---- */}
          <section id="settings-appearance" className="glass-panel scroll-mt-28 rounded-lg p-6 md:p-8">
            <h3 className="mb-6 border-b border-white/10 pb-4 font-title-lg text-title-lg text-on-surface">
              Appearance
            </h3>
            <Toggle
              label="OLED Pure Black Mode"
              badge="Beta"
              description="Uses true #000000 backgrounds to save battery on OLED displays and deepen contrast."
              checked={settings.oledMode}
              onChange={(v) => {
                updateSettings({ oledMode: v });
                document.documentElement.style.setProperty(
                  "--color-background",
                  v ? "#050505" : "#0f1112",
                );
              }}
            />

            <div className="mt-8 border-t border-white/10 pt-6">
              <MotionControl />
            </div>
          </section>

          {/* ---- API ---- */}
          <section id="settings-api" className="glass-panel scroll-mt-28 rounded-lg p-6 md:p-8">
            <h3 className="mb-6 border-b border-white/10 pb-4 font-title-lg text-title-lg text-on-surface">
              API Integrations
            </h3>
            <p className="mb-6 rounded-DEFAULT border border-secondary/20 bg-secondary-container/10 p-4 font-body-md text-[14px] text-on-surface-variant">
              CineSync ships with a working TMDB key and calls TMDB from the server, so nothing
              here is required. Set <code className="text-primary">TMDB_API_KEY</code> in{" "}
              <code className="text-primary">.env.local</code> to use your own.
            </p>
            <div className="space-y-6">
              <SecretField
                label="TMDB API Key (v3 auth)"
                hint="Get Key"
                href="https://www.themoviedb.org/settings/api"
                icon="key"
                value={settings.tmdbKey}
                onChange={(v) => updateSettings({ tmdbKey: v })}
              />
              <SecretField
                label="Trakt.tv Client ID"
                hint="Get ID"
                href="https://trakt.tv/oauth/applications"
                icon="code"
                value={settings.traktId}
                onChange={(v) => updateSettings({ traktId: v })}
              />
            </div>
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => showToast("Settings saved.")}
                className="rounded-full border border-primary-fixed/50 bg-primary px-6 py-3 font-label-md text-label-md font-semibold text-on-primary transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(78,222,163,0.6)]"
              >
                Save Changes
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="font-label-md text-label-md text-on-surface-variant">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-DEFAULT border border-outline-variant/50 bg-surface-container/50 px-4 py-3 font-body-md text-on-surface backdrop-blur-md transition-all focus:border-primary focus:shadow-[0_0_15px_rgba(78,222,163,0.2)] focus:outline-none"
      />
    </div>
  );
}

function SecretField({
  label,
  hint,
  href,
  icon,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  href: string;
  icon: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <label className="flex justify-between font-label-md text-label-md text-on-surface-variant">
        {label}
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-[12px] text-primary transition-colors hover:text-primary-fixed hover:underline"
        >
          {hint}
        </a>
      </label>
      <div className="relative">
        <Icon
          name={icon}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
        <input
          type={visible ? "text" : "password"}
          value={value}
          placeholder="Not set"
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-DEFAULT border border-outline-variant/50 bg-surface-container/50 py-3 pl-12 pr-12 font-mono text-sm text-on-surface backdrop-blur-md transition-all focus:border-primary focus:shadow-[0_0_15px_rgba(78,222,163,0.2)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide value" : "Show value"}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors hover:text-primary"
        >
          <Icon name={visible ? "visibility_off" : "visibility"} className="text-[20px]" />
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  badge,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div>
        <h4 className="flex items-center gap-2 font-body-lg text-body-lg text-on-surface">
          {label}
          {badge ? (
            <span className="rounded border border-secondary-container/30 bg-secondary-container/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-fixed-dim">
              {badge}
            </span>
          ) : null}
        </h4>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{description}</p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked
            ? "bg-primary shadow-[0_0_15px_rgba(78,222,163,0.3)]"
            : "bg-surface-container-highest"
        }`}
      >
        <span
          className={`absolute top-[2px] h-5 w-5 rounded-full border border-gray-300 bg-on-surface transition-all ${
            checked ? "left-[22px]" : "left-[2px]"
          }`}
        />
      </button>
    </div>
  );
}

export type { AppSettings };

const MOTION_OPTIONS: { id: MotionPreference; label: string; hint: string }[] = [
  { id: "system", label: "Match system", hint: "Follows your reduced-motion setting" },
  { id: "full", label: "Full motion", hint: "Always animate the backdrop" },
  { id: "reduced", label: "Still", hint: "Never animate the backdrop" },
];

/**
 * Motion override.
 *
 * The animated poster wall honours `prefers-reduced-motion`, as it should —
 * but Windows sets that flag for the whole machine under "Adjust for best
 * performance", so people who never opted out of animation get a frozen
 * backdrop and no way to say otherwise. This is that way.
 */
function MotionControl() {
  const preference = useMotionPreference();
  const systemReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div>
        <h4 className="font-body-lg text-body-lg text-on-surface">Background Motion</h4>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          The poster wall drifts, follows your cursor and cycles its titles.
          {systemReduced && preference === "system"
            ? " Your system currently asks for reduced motion, so it's holding still."
            : ""}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Background motion"
        className="flex shrink-0 rounded-full border border-white/10 bg-surface-container/60 p-1"
      >
        {MOTION_OPTIONS.map((option) => {
          const on = preference === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={option.hint}
              onClick={() => setMotionPreference(option.id)}
              className={`rounded-full px-4 py-1.5 font-label-md text-label-md transition-colors ${
                on
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
