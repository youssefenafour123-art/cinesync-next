"use client";

import { useEffect, useId, useState } from "react";
import { useSession } from "@/lib/useSession";
import { Icon } from "@/components/ui/Icon";
import { PosterMarquee } from "@/components/ui/PosterMarquee";
import { Typewriter } from "@/components/ui/Typewriter";
import { ModalShell } from "./ModalShell";

type Mode = "signin" | "signup" | "forgot" | "reset";

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
  forgot: {
    heading: "Reset your password",
    sub: "We'll email you a link to set a new one.",
    submit: "Send the link",
    swap: "Remembered it?",
    swapAction: "Sign in",
    quote: "It happens. Back in a moment.",
  },
  reset: {
    heading: "Choose a new password",
    sub: "This replaces the old one everywhere.",
    submit: "Save password",
    swap: "",
    swapAction: "",
    quote: "New password, same shelves.",
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
export function AuthModal({
  onClose,
  initialMode = "signin",
}: {
  onClose: () => void;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const { user, username } = useSession();
  const copy = COPY[mode];

  /*
     Someone already signed in has no business being shown a sign-in form —
     which is what clicking your own name used to do. The one exception is
     `reset`, where a recovery link deliberately leaves you signed in so you
     can choose the password.
  */
  const showAccount = Boolean(user) && mode !== "reset";

  return (
    <ModalShell
      onClose={onClose}
      label={showAccount ? "Your CineSync account" : COPY[mode].heading}
      className="glass-panel panel-glow max-w-4xl rounded-xl"
    >
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="custom-scrollbar overflow-y-auto p-6 md:p-10">
          {showAccount ? (
            <AccountPanel
              username={username}
              email={user?.email ?? null}
              onChangePassword={() => setMode("reset")}
              onDone={onClose}
            />
          ) : (
            <AuthForm mode={mode} copy={copy} onMode={setMode} onDone={onClose} />
          )}
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

/** What a signed-in person sees: who they are, and the two things they can do. */
function AccountPanel({
  username,
  email,
  onChangePassword,
  onDone,
}: {
  username: string | null;
  email: string | null;
  onChangePassword: () => void;
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);

  const leave = async () => {
    setPending(true);
    try {
      const { signOut } = await import("@/lib/auth");
      await signOut();
      onDone();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Icon name="account_circle" fill className="text-[44px] text-primary" />
        <div className="min-w-0">
          <h1 className="truncate font-display-md text-headline-lg text-on-surface">
            {username ?? "Your account"}
          </h1>
          {email ? (
            <p className="truncate font-body-md text-[13px] text-on-surface-variant">{email}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onChangePassword}
          className="flex items-center gap-3 rounded-DEFAULT border border-outline-variant/40 bg-surface-container/40 px-4 py-3 text-left font-label-md text-label-md text-on-surface transition-colors hover:border-primary/40"
        >
          <Icon name="key" className="text-[20px] text-on-surface-variant" />
          Change password
        </button>

        <button
          type="button"
          onClick={leave}
          disabled={pending}
          className="flex items-center gap-3 rounded-DEFAULT border border-outline-variant/40 px-4 py-3 text-left font-label-md text-label-md text-on-surface-variant transition-colors hover:border-error/40 hover:text-error disabled:opacity-60"
        >
          <Icon name="logout" className="text-[20px]" />
          {pending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

function AuthForm({
  mode,
  copy,
  onMode,
  onDone,
}: {
  mode: Mode;
  copy: (typeof COPY)[Mode];
  onMode: (m: Mode) => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  /*
     Seconds left before the confirmation link can be sent again.

     A cooldown rather than an unlimited button, because the thing on the other
     end of it is rate-limited: letting someone press it four times in a row
     spends the allowance that the one useful send needed.
  */
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async (email: string) => {
    setError(null);
    setPending(true);
    try {
      const { resendConfirmation } = await import("@/lib/auth");
      await resendConfirmation(email);
      setResent(true);
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't send. Try again in a minute.");
    } finally {
      setPending(false);
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const form = new FormData(e.currentTarget);
      const { signIn, signUp } = await import("@/lib/auth");
      if (mode === "signin") {
        const email = String(form.get("email"));
        try {
          await signIn(email, String(form.get("password")));
        } catch (err) {
          /*
             Supabase refuses an unconfirmed account with "Email not
             confirmed", which is accurate and a dead end — the person has no
             way to act on it. Landing them on the same screen a fresh signup
             reaches gives them the resend button instead.
          */
          if (err instanceof Error && /not confirmed/i.test(err.message)) {
            setSentTo(email);
            return;
          }
          throw err;
        }
        onDone();
      } else if (mode === "signup") {
        const email = String(form.get("email"));
        const { needsConfirmation } = await signUp({
          email,
          password: String(form.get("password")),
          username: String(form.get("username")),
        });
        if (needsConfirmation) setSentTo(email);
        else onDone();
      } else if (mode === "forgot") {
        const email = String(form.get("email"));
        const { requestPasswordReset } = await import("@/lib/auth");
        await requestPasswordReset(email);
        setSentTo(email);
      } else {
        const { updatePassword } = await import("@/lib/auth");
        await updatePassword(String(form.get("password")));
        onDone();
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
          {mode === "forgot" ? (
            <>
              If <span className="text-on-surface">{sentTo}</span> has an account, a link to set a
              new password is on its way.
            </>
          ) : (
            <>
              We sent a confirmation link to <span className="text-on-surface">{sentTo}</span>. Open
              it and you&rsquo;ll be signed in.
            </>
          )}
        </p>
        {/*
           Only for a signup. A password reset deliberately reports the same
           thing whether or not the address has an account, so offering to send
           it again would be offering to confirm that it does.
        */}
        {mode === "signup" ? (
          <div className="flex flex-col gap-2">
            {error ? (
              <p className="font-body-md text-body-md text-error" role="alert">
                {error}
              </p>
            ) : resent ? (
              <p className="font-body-md text-body-md text-primary" role="status">
                Sent again. Check your spam folder too.
              </p>
            ) : (
              <p className="font-body-md text-[14px] text-on-surface-variant">
                Nothing arrived? It may be in spam.
              </p>
            )}

            <button
              type="button"
              onClick={() => void resend(sentTo)}
              disabled={pending || cooldown > 0}
              className="self-start rounded-full bg-surface-container px-5 py-2 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-50"
            >
              {pending
                ? "Sending…"
                : cooldown > 0
                  ? `Send again in ${cooldown}s`
                  : "Send the link again"}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setResent(false);
            setError(null);
          }}
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

        {/* Every step except choosing a new password needs the address; that
            one already knows who you are, from the link you followed. */}
        {mode !== "reset" ? (
          <Field
            name="email"
            label="Email"
            type="email"
            icon="mail"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        ) : null}

        {mode !== "forgot" ? (
          <PasswordField
            name="password"
            label={mode === "reset" ? "New password" : "Password"}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        ) : null}
      </div>

      {mode === "signin" ? (
        <button
          type="button"
          onClick={() => onMode("forgot")}
          className="-mt-2 self-start font-label-md text-[13px] text-on-surface-variant transition-colors hover:text-primary"
        >
          Forgot your password?
        </button>
      ) : null}

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

      {copy.swap ? (
      <p className="text-center font-body-md text-[13px] text-on-surface-variant">
        {copy.swap}{" "}
        <button
          type="button"
          onClick={() => onMode(mode === "signin" ? "signup" : "signin")}
          className="font-label-md text-primary transition-opacity hover:opacity-80"
        >
          {copy.swapAction}
        </button>
      </p>
      ) : null}
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
