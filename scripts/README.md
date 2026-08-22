# Verification scripts

Four Puppeteer suites that drive the running app and assert real behaviour —
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
node scripts/verify-ux.js
node scripts/verify-data.js
```

Both exit non-zero on failure and write screenshots into `OUT`.

`verify-core.js` only reaches its last two checks when `CSV` points at a real
IMDb export — with no list in the store, "nothing to sync" reports a different
reason than the one it asserts.

## What they cover

**`verify-core.js`** — the rebuild's baseline:
markup is inside `<body>`; the details modal shows the *clicked* title; the
trailer plays in-modal and Escape destroys the iframe; all seven tabs render; the
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

**`verify-ux.js`** — the fourth round:
the motion preference reaches CSS as `data-motion`; the poster wall is
*visibly* on screen; the wall and its marquees animate; its columns light up
near the pointer; the Discover hero slides directionally and its active dot
fills over the interval; the quote strip renders with a citation and rotates;
the Arabic tab renders country and genre chips and re-queries on a country
change; the Upcoming hero slides in, pans and fills its dot; and the wall is
present on a tab that never feeds it.

It also covers the fifth round: the Discover hero sits on an opaque base with
the wall no longer reachable through it; posters carry an animated, staggered,
click-through edge ring; and returning to Discover via the logo neither reloads
the document nor replays skeletons.

Two of its assertions deserve a note. "The posters don't appear" was
diagnosed twice as a data problem and was neither time — the wall was in the
DOM, fully loaded and animating, at ~15% effective opacity under the scrim. So
this suite does not assert that the element exists or that the images loaded;
both were already true while the bug was live. It asserts on the *product* of
wall opacity, column opacity and scrim alpha, which is the number that decides
whether a person can see it.

The second is the CSS animation checks, which assert on computed
`animation-duration` and not on `animation-name`. An ungated blanket
`animation-duration: 0.01ms !important` reduced-motion reset had the Upcoming
hero's pan and dot timers frozen on a machine that reports reduced motion — and
this suite passed anyway, because `animationName` still read `cs-hero-pan`. A
name proves a rule matched; only the duration proves anything moves.

**`verify-data.js`** — correctness of what the app *says*, plus the calendar:
an unreleased title is findable and flagged; Enter expands to the full result
list; a submitted query is remembered; a series is credited to its creator and
not to an executive producer; the quote strip has no controls; the poster wall
sits inside its visibility band; and the calendar renders a month grid, details
a day, shows season/episode codes for episode drops, moves between months and
filters films out.

## A note on writing assertions here

Two traps cost real time when these were written:

- **`innerText` applies `text-transform`.** A heading styled `uppercase` reads
  as `BIOGRAPHY`, so case-sensitive regexes silently fail. Use `/…/i`, or
  `textContent`.
- **Fixed `sleep()` calls are flaky.** Data-dependent steps use the `waitFor`
  poller instead; four "failures" in an early run were purely the harness
  sampling before React had rendered.
