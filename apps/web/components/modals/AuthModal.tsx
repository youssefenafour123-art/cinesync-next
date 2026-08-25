"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { PosterMarquee } from "@/components/ui/PosterMarquee";
import { Typewriter } from "@/components/ui/Typewriter";
import { ModalShell } from "./ModalShell";

type Mode = "signin" | "signup";

const COPY = {
  signin: {
    heading: "Welcome back",
    sub: "Sign in to pick up where you left off.",
    submit: "Sign in",
    swap: "Don't have an account?",
    swapAction: "Create one",
    quote: "Everything you were watching, still here.",
  },
  signup: {
    heading: "Create your account",
    sub: "A username, an email, and you're in.",
    submit: "Create account",
    swap: "Already have an account?",
    swapAction: "Sign in",
    quote: "Keep your films. Follow your people.",
  },
} as const;

/**
 * Sign in and sign up.
 *
 * Ported from a shadcn-style component, and deliberately without any of its
 * machinery. The original wanted Radix Slot and Label, `cva`, `clsx`,
 * `tailwind-merge` and `lucide-react` — six packages to render two buttons and
 * three inputs. Slot served an `asChild` this screen never uses, Label served
 * an association a `htmlFor` already makes, and the variant matrix existed for
 * six button styles of which this uses two. The icons come from `Icon`, the
 * Material Symbols wrapper the rest of the app uses, so the eye-toggle here
 * matches the one `SettingsTab` already ships rather than introducing a second
 * icon set for one field.
 *
 * The right pane is the tweak: where the source had a static background image
 * and a quote, this runs real poster art from the catalogue. See
 * `PosterMarquee`.
 */
export function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const copy = COPY[mode];

  return (
    <ModalShell
      onClose={onClose}
      label={mode === "signin" ? "Sign in to CineSync" : "Create a CineSync account"}
      className="glass-panel panel-glow max-w-4xl rounded-xl"
    >
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="custom-scrollbar overflow-y-auto p-6 md:p-10">
          <AuthForm mode={mode} copy={copy} onSwap={() => setMode(mode === "signin" ? "signup" : "signin")} />
        </div>

        {/*
           Hidden below `md`, as in the source. On a phone the form fills the
           screen and a decorative column would only push it down.
        */}
        <div className="relative hidden overflow-hidden md:block">
          <PosterMarquee />
          <div className="auth-marquee-scrim" />
          <div className="relative z-10 flex h-full items-end p-6">
            <blockquote className="font-body-md text-[15px] leading-relaxed text-on-surface">
              <Typewriter key={mode} text={copy.quote} speed={38} />
            </blockquote>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function AuthForm({
  mode,
  copy,
  onSwap,
}: {
  mode: Mode;
  copy: (typeof COPY)[Mode];
  onSwap: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const form = new FormData(e.currentTarget);
      const { signIn, signUp } = await import("@/lib/auth");
      if (mode === "signin") {
        await signIn(String(form.get("email")), String(form.get("password")));
      } else {
        const email = String(form.get("email"));
        const { needsConfirmation } = await signUp({
          email,
          password: String(form.get("password")),
          username: String(form.get("username")),
        });
        if (needsConfirmation) setSentTo(email);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  };

  /*
     The account exists but there is no session yet, because this project asks
     for the address to be confirmed. Saying nothing here would leave a
     successful signup looking exactly like a failed one.
  */
  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <Icon name="mark_email_read" className="text-[40px] text-primary" />
        <h1 className="font-display-md text-headline-lg text-on-surface">Check your email</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          We sent a confirmation link to <span className="text-on-surface">{sentTo}</span>. Open it
          and you&rsquo;ll be signed in.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="self-start font-label-md text-label-md text-primary transition-opacity hover:opacity-80"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} autoComplete="on" className="flex flex-col gap-6">
      <div>
        <h1 className="font-display-md text-headline-lg text-on-surface">{copy.heading}</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{copy.sub}</p>
      </div>

      <div className="flex flex-col gap-4">
        {mode === "signup" ? (
          <Field
            name="username"
            label="Username"
            type="text"
            icon="alternate_email"
            placeholder="how people find you"
            autoComplete="username"
            hint="Letters, numbers and underscores. 3–20 characters."
            required
          />
        ) : null}

        <Field
          name="email"
          label="Email"
          type="email"
          icon="mail"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />

        <PasswordField
          name="password"
          label="Password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />
      </div>

      {mode === "signup" ? (
        /*
           Said plainly, on the screen where the decision is made. The default
           is followers-visible watch history, and a default that has to be
           discovered later is not really a default anyone chose.
        */
        <p className="rounded-DEFAULT border border-outline-variant/40 bg-surface-container/40 p-3 font-body-md text-[13px] leading-relaxed text-on-surface-variant">
          <Icon name="visibility" className="mr-1.5 align-[-4px] text-[18px] text-primary" />
          Once you link Stremio, what you watch is visible to people who follow you. You can turn
          that off any time in Settings.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="font-body-md text-[13px] text-error">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-primary px-5 py-3 font-label-md text-label-md text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Working…" : copy.submit}
      </button>

      <p className="text-center font-body-md text-[13px] text-on-surface-variant">
        {copy.swap}{" "}
        <button
          type="button"
          onClick={onSwap}
          className="font-label-md text-primary transition-opacity hover:opacity-80"
        >
          {copy.swapAction}
        </button>
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  type,
  icon,
  placeholder,
  autoComplete,
  hint,
  required,
}: {
  name: string;
  label: string;
  type: string;
  icon: string;
  placeholder: string;
  autoComplete: string;
  hint?: string;
  required?: boolean;
}) {
  const id = useId();

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-label-md text-label-md text-on-surface-variant">
        {label}
      </label>
      <div className="relative">
        <Icon
          name={icon}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
        />
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full rounded-DEFAULT border border-outline-variant/50 bg-surface-container/50 py-3 pl-12 pr-4 font-body-md text-body-md text-on-surface transition-colors placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none"
        />
      </div>
      {hint ? <p className="font-body-md text-[12px] text-on-surface-variant/70">{hint}</p> : null}
    </div>
  );
}

/** The eye-toggle field, matching `SettingsTab`'s `SecretField`. */
function PasswordField({
  name,
  label,
  autoComplete,
}: {
  name: string;
  label: string;
  autoComplete: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-label-md text-label-md text-on-surface-variant">
        {label}
      </label>
      <div className="relative">
        <Icon
          name="lock"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
        />
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          placeholder="••••••••"
          className="w-full rounded-DEFAULT border border-outline-variant/50 bg-surface-container/50 py-3 pl-12 pr-12 font-body-md text-body-md text-on-surface transition-colors placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors hover:text-primary"
        >
          <Icon name={visible ? "visibility_off" : "visibility"} className="text-[20px]" />
        </button>
      </div>
    </div>
  );
}
