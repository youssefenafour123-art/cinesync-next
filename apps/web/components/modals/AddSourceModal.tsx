"use client";

import { useRef, useState } from "react";
import type { ImdbListPayload } from "@/app/api/imdb-list/route";
import { login } from "@/lib/stremio";
import { parseImdbCsv } from "@/lib/csv";
import { useSourcesStore } from "@/store/useSourcesStore";
import { useAppStore } from "@/store/useAppStore";
import { Icon } from "@/components/ui/Icon";
import { ModalShell } from "./ModalShell";

type Status = { tone: "ok" | "error"; message: string } | null;

export function AddSourceModal() {
  const close = () => useAppStore.getState().setAddSourceOpen(false);
  const showToast = useAppStore((s) => s.showToast);
  const addStremio = useSourcesStore((s) => s.addStremio);
  const addImdbList = useSourcesStore((s) => s.addImdbList);
  const addCsv = useSourcesStore((s) => s.addCsv);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [stremioStatus, setStremioStatus] = useState<Status>(null);

  const [listUrl, setListUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [imdbStatus, setImdbStatus] = useState<Status>(null);
  const [showCsv, setShowCsv] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const connect = async () => {
    if (!email || !password) {
      setStremioStatus({ tone: "error", message: "Enter your email and password." });
      return;
    }
    setConnecting(true);
    setStremioStatus(null);
    try {
      const authKey = await login(email, password);
      addStremio(email, authKey);
      setStremioStatus({ tone: "ok", message: "Account connected." });
      showToast(`Connected ${email}.`);
      setEmail("");
      setPassword("");
    } catch (err) {
      setStremioStatus({
        tone: "error",
        message: err instanceof Error ? err.message : "Login failed.",
      });
    } finally {
      setConnecting(false);
    }
  };

  const importList = async () => {
    const url = listUrl.trim();
    if (!url) {
      setImdbStatus({ tone: "error", message: "Paste an IMDb list or watchlist URL." });
      return;
    }

    setImporting(true);
    setImdbStatus(null);
    try {
      const res = await fetch(`/api/imdb-list?url=${encodeURIComponent(url)}`);
      const data = (await res.json()) as ImdbListPayload & { error?: string; csv?: boolean };

      if (!res.ok || data.error) {
        setImdbStatus({ tone: "error", message: data.error ?? "Couldn't read that list." });
        /*
           Open the CSV panel when the URL route is a dead end rather than a
           typo. A private watchlist is one such case; IMDb's new opaque
           profile links are the other, and there the export is not a fallback
           but the only way in — `csv` is the server saying so outright rather
           than this having to pattern-match another message.
        */
        if (data.csv || /private/i.test(data.error ?? "")) setShowCsv(true);
        return;
      }

      addImdbList(url, data.listKind, data.name, data.items);
      const extra = data.truncated ? " (capped at 2000)" : "";
      setImdbStatus({
        tone: "ok",
        message: `Imported ${data.items.length} titles from “${data.name}”${extra}.`,
      });
      showToast(`Imported ${data.items.length} titles from ${data.name}.`);
      setListUrl("");
      setTimeout(close, 1600);
    } catch {
      setImdbStatus({ tone: "error", message: "Couldn't reach the server." });
    } finally {
      setImporting(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImdbStatus({ tone: "error", message: "That isn't a .csv file." });
      return;
    }
    try {
      const { items, error } = parseImdbCsv(await file.text());
      if (error || !items.length) {
        setImdbStatus({ tone: "error", message: error ?? "No items found." });
        return;
      }
      addCsv(file.name, items);
      setImdbStatus({ tone: "ok", message: `Parsed ${items.length} items from ${file.name}.` });
      showToast(`Imported ${items.length} titles from ${file.name}.`);
      setTimeout(close, 1500);
    } catch {
      setImdbStatus({ tone: "error", message: "Couldn't read that file." });
    }
  };

  return (
    <ModalShell
      onClose={close}
      label="Add a source"
      className="max-w-3xl rounded-lg border border-white/10 bg-surface-container-high shadow-2xl"
    >
      <div className="custom-scrollbar overflow-y-auto p-6 md:p-8">
        <h2 className="mb-2 font-display-md text-headline-lg text-white">Add Source</h2>
        <p className="mb-6 font-body-md text-body-md text-on-surface-variant">
          Connect a Stremio account to sync into, and an IMDb list to sync from.
        </p>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* ---- Stremio ---- */}
          <div className="rounded-2xl border border-transparent bg-surface-variant/30 p-5 transition-all hover:border-primary/30">
            <div className="mb-3 flex items-center gap-3">
              <Icon name="play_circle" className="text-3xl text-primary" />
              <h3 className="font-title-lg text-title-lg text-white">Stremio Account</h3>
            </div>
            <p className="mb-5 text-sm text-on-surface-variant">
              Your password goes to Stremio through this app&rsquo;s proxy and is never stored —
              only the returned session key is kept, in your browser.
            </p>

            <div className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                placeholder="Email"
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-surface-container px-4 py-3 text-white placeholder-on-surface-variant/50 transition-all focus:border-primary focus:outline-none"
              />
              <input
                type="password"
                value={password}
                placeholder="Password"
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connect()}
                className="w-full rounded-xl border border-white/10 bg-surface-container px-4 py-3 text-white placeholder-on-surface-variant/50 transition-all focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={connect}
                disabled={connecting}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-label-md text-label-md text-on-primary transition-colors hover:bg-primary-fixed disabled:opacity-70"
              >
                <Icon
                  name={connecting ? "progress_activity" : "link"}
                  className={connecting ? "animate-spin" : ""}
                />
                {connecting ? "Connecting…" : "Connect Stremio"}
              </button>
              <StatusLine status={stremioStatus} />
            </div>
          </div>

          {/* ---- IMDb ---- */}
          <div className="rounded-2xl border border-transparent bg-surface-variant/30 p-5 transition-all hover:border-[#f5c518]/30">
            <div className="mb-3 flex items-center gap-3">
              <Icon name="movie" className="text-3xl text-[#f5c518]" />
              <h3 className="font-title-lg text-title-lg text-white">IMDb List</h3>
            </div>
            <p className="mb-4 text-sm text-on-surface-variant">
              Paste a list URL, or your profile watchlist URL.
            </p>

            <div className="flex flex-col gap-3">
              <input
                type="url"
                value={listUrl}
                placeholder="https://www.imdb.com/list/ls024149810/"
                onChange={(e) => setListUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && importList()}
                aria-label="IMDb list or watchlist URL"
                className="w-full rounded-xl border border-white/10 bg-surface-container px-4 py-3 text-sm text-white placeholder-on-surface-variant/50 transition-all focus:border-[#f5c518] focus:outline-none"
              />
              <button
                type="button"
                onClick={importList}
                disabled={importing}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#f5c518] py-3 font-label-md text-label-md text-black transition-opacity hover:opacity-90 disabled:opacity-70"
              >
                <Icon
                  name={importing ? "progress_activity" : "download"}
                  className={importing ? "animate-spin" : ""}
                />
                {importing ? "Importing…" : "Import List"}
              </button>
              <StatusLine status={imdbStatus} />

              {/*
                 Where the URL comes from, before the rule about it being
                 public. A profile share link has no list id in it and cannot
                 be imported, and that is the one people reach for first, so it
                 is worth saying which address to copy rather than only which
                 shapes are accepted.
              */}
              <p className="text-[12px] leading-relaxed text-on-surface-variant/70">
                On IMDb, open <span className="text-on-surface-variant">Your Watchlist</span> and
                copy the address bar — it ends in <code className="text-primary/80">/watchlist</code>.
                A profile link on its own can&rsquo;t be imported.
              </p>

              <p className="text-[12px] leading-relaxed text-on-surface-variant/70">
                Watchlists must be public — on IMDb, Account Settings → Privacy → “Your watchlist”.
                You can switch it back afterwards.
              </p>

              <button
                type="button"
                onClick={() => setShowCsv((v) => !v)}
                className="text-left text-[12px] text-primary transition-opacity hover:opacity-80"
              >
                {showCsv ? "Hide CSV upload" : "Or upload a CSV export instead"}
              </button>

              {showCsv ? (
                <>
                  <label
                    htmlFor="csv-upload"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void handleFile(e.dataTransfer.files[0]);
                    }}
                    className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-surface-container px-4 py-6 transition-all hover:border-[#f5c518]/50 hover:bg-[#f5c518]/5"
                  >
                    <Icon name="upload_file" className="mb-1 text-3xl text-on-surface-variant" />
                    <span className="text-center text-sm text-on-surface-variant">
                      Click or drop a CSV
                    </span>
                  </label>
                  <input
                    ref={fileRef}
                    id="csv-upload"
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      void handleFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p
      role="status"
      className={`text-center text-xs leading-relaxed ${
        status.tone === "ok" ? "text-primary" : "text-error"
      }`}
    >
      {status.message}
    </p>
  );
}
