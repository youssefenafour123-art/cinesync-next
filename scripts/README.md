# Verification scripts

Two Puppeteer suites that drive the running app and assert real behaviour —
they were used to verify the rebuild and every feature added on top of it.

They are **not** wired into `npm test`, because Puppeteer isn't a dependency of
this project (it would add ~200MB of Chromium for something you run by hand
every few weeks).

## Running them

Start the app first:

```bash
npm run dev        # note the port it prints — 3000, or 3001 if taken
```

Then, from anywhere:

```bash
# Puppeteer lives in the legacy folder's node_modules; point NODE_PATH at it,
# or run `npm i -D puppeteer` here and drop the NODE_PATH line.
set NODE_PATH=C:\Users\User\Desktop\Project\imdb to stremio\node_modules
set BASE=http://localhost:3001
set OUT=%TEMP%

node scripts/verify-core.js
node scripts/verify-features.js
```

Both exit non-zero on failure and write screenshots into `OUT`.

`verify-core.js` only reaches its last two checks when `CSV` points at a real
IMDb export — with no list in the store, "nothing to sync" reports a different
reason than the one it asserts.

## What they cover

**`verify-core.js`** — the rebuild's baseline:
markup is inside `<body>`; the details modal shows the *clicked* title; the
trailer plays in-modal and Escape destroys the iframe; all six tabs render; the
Stremio proxy reaches `api.strem.io` for `login` / `datastoreMeta` /
`datastorePut` without 404ing; an IMDb CSV parses every data row; sync refuses
to run with no account connected. Pass `CSV=<path>` to exercise the parser
against a real IMDb export.

**`verify-features.js`** — the seven later features:
Discover hero is a slider; "In Library" badges; global search returns people and
titles; the person modal carries bio, filmography and upcoming; the scroll lock
releases after stacked modals; the Movies tab offers ten moods and the chips
swap the grid; "Under the Radar" contains nothing under a 7.2 IMDb rating or
newer than three years; the details modal shows attributed scores, press
critics credited to Wikipedia and reviews labelled as community reviews; cast
and crew open a profile.

## A note on writing assertions here

Two traps cost real time when these were written:

- **`innerText` applies `text-transform`.** A heading styled `uppercase` reads
  as `BIOGRAPHY`, so case-sensitive regexes silently fail. Use `/…/i`, or
  `textContent`.
- **Fixed `sleep()` calls are flaky.** Data-dependent steps use the `waitFor`
  poller instead; four "failures" in an early run were purely the harness
  sampling before React had rendered.
