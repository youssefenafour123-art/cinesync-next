# CineSync

Discover movies, anime and Arabic cinema, then sync your IMDb watchlist into your Stremio
library.

A Next.js rebuild of the original single-file `index.html` + `server.js` app that lived in
`../imdb to stremio`. Same OLED-black/emerald design, now eight tabs — rebuilt so the
features actually work.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

No API key setup required. `TMDB_API_KEY` in `.env.local` is optional; without it the
app falls back to the key the original carried. Either way TMDB is only ever called from
the server, so the key never reaches the browser. `OMDB_API_KEY` is optional too — see
[Ratings and critics](#ratings-and-critics).

## Deploying

`render.yaml` is a Render Blueprint: **New → Blueprint** in the Render dashboard, pick this
repo, apply. Render then redeploys on every push to `main`.

It has to be a Node web service, not a static site. Every tab is fed by a route handler
under `app/api` that talks to TMDB, Cinemeta and Wikipedia server-side — that is what keeps
the TMDB key off the browser, and a static export ships none of it. `next start` reads
`PORT` and binds `0.0.0.0`, which is exactly what Render provides, so the stock `npm start`
is the whole start command.

Two env vars, both optional and both left unset in the blueprint so they are entered in
Render rather than committed:

- `TMDB_API_KEY` — your own key, instead of sharing the fallback's rate limit.
- `NEXT_PUBLIC_SITE_URL` — the absolute origin behind `metadataBase`, so social cards
  resolve. It can only be filled in after the first deploy, because that is when the
  hostname exists; set it and redeploy. Nothing else depends on it.

`region` is the one blueprint value that cannot be changed later — moving a service between
regions means recreating it. It is set to `frankfurt`.

`/api/discover` is prerendered at build time, so it is the one route whose network calls
happen during a deploy rather than during a request. Its poster-wall fetch is caught for
exactly that reason: a rate-limited TMDB should not turn a deploy red over decoration
sitting behind a scrim.

If the build is OOM-killed on a 512MB instance, set `NODE_OPTIONS=--max-old-space-size=400`
— the build completes under that cap. On the free plan the service also sleeps after 15
minutes idle and the next request pays a cold start of roughly a minute. The rails themselves are quick after that: route handlers are
`revalidate: 3600`, so a month of calendar data or a set of Discover rails is fetched once
an hour rather than per visitor.

## Stack

| | |
|---|---|
| Next.js 16 (App Router, TypeScript) | pages + the API layer |
| Tailwind CSS v4 | design tokens live in `app/globals.css` under `@theme` |
| Framer Motion | React-lifecycle animation — modals, tab fades, staggers, counters |
| GSAP + ScrollTrigger | continuous/imperative animation — scroll reveals, card tilt, background drift, progress ring |
| Zustand | UI state (`store/useAppStore`) and persisted sources (`store/useSourcesStore`) |

## Layout

```
app/
  page.tsx                     tab shell
  layout.tsx                   fonts, <body>, metadata
  globals.css                  @theme tokens + component classes
  api/
    stremio/[...path]/route.ts POST proxy → api.strem.io (Origin spoof)
    discover|movies|anime|tracker/route.ts
    anime/search/route.ts
    meta/[type]/[id]/route.ts
components/{layout,tabs,modals,ui}/
lib/                           tmdb, cinemeta, stremio, csv, hooks
store/                         zustand stores
```

### Why the app has its own API routes

The original fetched TMDB and Cinemeta directly from the browser, one request per card
plus a rating lookup per card — roughly 160 requests to paint the Anime tab, none cached.
Those fetches now happen in route handlers with `revalidate: 3600`, so each tab is a
single cached request.

### The Stremio proxy

`api.strem.io` validates the `Origin` header server-side and silently rejects anything
that isn't the Stremio web app, so browser calls have to be relayed. Everything goes
through `/api/stremio/<method>` — `login`, `datastorePut`, `datastoreGet`,
`datastoreMeta`.

Your Stremio password is sent to Stremio through that proxy and is never stored. Only the
returned `authKey` is kept, in `localStorage`.

## Data

`localStorage` keys are unchanged from the original (`cineSyncSources`,
`cineSyncHistory`), so anything the old app saved still loads here.

| Tab | Source |
|---|---|
| Discover | Cinemeta top movies + series |
| Movies | TMDB discover — cult classics, modern masterpieces, under the radar |
| Anime | TMDB discover, genre 16 + Japanese — top rated, airing, upcoming, hidden gems |
| Arabic | TMDB discover, `with_original_language=ar` + origin country, filtered to Cinemeta |
| Upcoming | TMDB discover — upcoming and last two months, with trailers |
| Calendar | TMDB discover + per-season episode air dates, a month at a time |
| My Library | your connected sources → Stremio `datastorePut` |
| Settings | `localStorage` |

### The release calendar

Upcoming answers "what's coming soon" as two rails. Calendar answers "what lands on the
14th", which needs a grid — and, for a series, *which episodes* drop on which day, by
season and episode number.

Films are the easy half: one `/discover/movie` window on `primary_release_date`. Episodes
are not. TMDB has no "what airs on this date" endpoint; `/discover/tv` with an `air_date`
window returns *shows* with an episode somewhere in the range and says nothing about
which one or which day. So each show costs two more requests — fetch it to find which
seasons could overlap the window, then fetch those seasons, whose episode lists do carry
a per-episode `air_date`.

Three details are load-bearing:

- **Season selection looks at the window, not at now.** Using `last_episode_to_air` alone
  resolves the currently-airing season, so browsing back a year would report no episodes.
- **Strip programming is excluded** (TMDB genres 10763/10767/10764/10766). Without the
  filter, "popular series with an episode this month" is a nightly news bulletin at
  S58E183 and a daily reality show at S13E136 — more than half the month. With it, the
  same query returns Reacher, House of the Dragon, Silo and Ted Lasso.
- **A binge release is one entry, not five.** Episodes dropping on the same day are
  grouped, so one show can't fill a day cell.
- **Films are deduplicated by TMDB id.** The two `/discover/movie` pages are two requests
  against an ordering TMDB recomputes between them, so a title on the page boundary can
  come back on both — "Spa Weekend" appeared twice on 20 August 2026.

Clicking a day opens it full-size (`components/modals/DayModal.tsx`): backdrop art per
release, the whole synopsis, every episode with its own summary, and arrows to walk to the
next day. The grid cell is 116px of cropped poster thumbnails and the panel under the grid
shares the page with the month, so both stay compact — this is the version with room to
read. Empty days open too; "nothing releases on the 3rd" is an answer worth being able to
ask for.

That modal is portalled to `<body>`, unlike every other modal in the app. It is rendered
from inside a tab, and the tab shell is `<main className="relative z-10">` — a stacking
context — so its z-211 was only ever compared against `main`, and lost to the top nav
(z-50) and the mobile tab bar (z-100): the navs painted over the panel and the backdrop
failed to dim them.

See `lib/calendar.ts`.

### Credits

`director` is the film's director — *all* of them — or, for a series, its creator, and
`directorLabel` says which. That is worth stating because it was wrong for a long time in
a way nothing surfaced: the field was filled by
`crew.find(job === "Director") ?? crew.find(job === "Executive Producer")`, and TMDB's
series-level crew almost never contains a Director. So every show was credited to an
executive producer under a "Director" heading — Breaking Bad to Michelle MacLaren rather
than Vince Gilligan, Chernobyl to Carolyn Strauss rather than Craig Mazin. Real people,
credited with a job they did not do. The film half dropped co-directors: "Lana Wachowski"
for The Matrix, "Joel Coen" for No Country for Old Men.

Cinemeta's `director` is only used for films, because on a show it is whoever directed
some episode; `/api/enrich` takes TMDB's value first, which is the one that knows the
difference.

`writer` is the same shape of problem. TMDB files the whole writing department under one
department and half a dozen job titles that do not mean the same thing: "Story" is who had
the idea, "Novel" / "Characters" / "Comic Book" are the source material, and only
"Screenplay" / "Teleplay" / "Writer" are the credit meant by "who wrote it". So the
highest-ranked job actually present wins and only the people holding *that* job are listed
— otherwise Blade Runner is written by Philip K. Dick, who wrote the novel, and Joker by
Bob Kane. `writerLabel` carries the credit's own name, so the heading reads "Screenplay"
where that is what it is.

TMDB is preferred over Cinemeta here for the same reason as the director, plus one:
the details modal lets the list item override `/api/enrich`, so a title opened from a rail
already shows TMDB's credit. Preferring Cinemeta in the route made the same film read
differently depending on whether it was opened from a rail or cold from the calendar.

A series prints its creators once. `created_by` already means "the people who wrote it", so
a writing credit naming exactly those people is the same sentence under a second heading —
"Creator: Vince Gilligan" beside "Writer: Vince Gilligan". A show whose writing credit is
wider than its creators still says so. Films keep both lines: writing and directing are
separate credits even when one person holds both, which is how IMDb prints them. The
comparison ignores punctuation, because TMDB writes "D. B. Weiss" where IMDb writes
"D.B. Weiss".

Series also carry `seasonCount` and `episodeCount` — TMDB's totals for the whole run, with
Cinemeta's `videos` list (season 0 excluded, that is where specials live) as the fallback
for a title TMDB cannot match.

### Search

The result order is TMDB's own, deliberately unmodified. It used to be re-sorted by
`vote_count` descending, which made unreleased films unfindable — a film that has not come
out has zero votes by definition, so it sank below every established title with a similar
name before the list was cut to eight. "The Odyssey" returned four older films of that
name and not Nolan's.

TMDB's ordering is already a relevance-and-popularity blend and puts anticipated titles
where they belong. Every attempt to improve on it made something else worse: an
exact-title bonus strong enough to lift Nolan's Odyssey also lifted a 1967 Spider-Man
cartoon over No Way Home.

Typing shows the best few; Enter opens the full list, which is what makes a title outside
the top few reachable. One request serves both — enrichment runs in parallel, so it costs
latency once rather than per title. Past queries are kept in `localStorage`.

### Arabic cinema

Egyptian, Moroccan, Lebanese and Syrian film and television, plus eight more countries,
browsable by country and by genre.

Three things make the tab work where the obvious implementation does not:

- **Language and country together.** `with_origin_country=MA` alone returns 40 films,
  Italian comedies shot in Morocco among them. Adding `with_original_language=ar` grows
  the pool to 521 *and* removes the Italian ones.
- **Thresholds set for the actual catalogue.** TMDB's Arabic voter base is thin: the
  most-voted Arabic series has ~555 votes against `curate`'s site-wide floor of 500.
  The Arabic rails use `minVotes: 25` and a 3-vote entry bar; at the site-wide numbers
  the tab is empty, and at a 10-vote bar Syria returns 3 films instead of 23. Thin
  averages are handled by the Bayesian weighting rather than by exclusion — a 3-vote
  title is pulled ~89% toward the pool mean, so it appears without being ranked as
  acclaimed.
- **Every title is confirmed in Stremio.** A TMDB id is not enough to add something to a
  Stremio library: the title needs an IMDb id, and Cinemeta has to carry it, or the row
  appears in the library and cannot be opened. Both are checked before a card is shown,
  which is why a narrow country/genre pair can legitimately come back empty.

See `lib/arabic.ts`.

### Ratings and critics

The details modal shows three tiers, each from a different place and labelled as such:

| | Source | Notes |
|---|---|---|
| Rotten Tomatoes / Metacritic / IMDb scores | OMDb, else Wikipedia | OMDb needs a free `OMDB_API_KEY`; without one the numbers come from the film's Wikipedia article, which quotes both aggregators |
| Named press critics | Wikipedia | The "Critical response" section, parsed into critic + outlet + excerpt, credited to Wikipedia (CC BY-SA) and linked back |
| Community reviews | TMDB | Written by TMDB members, never presented as press criticism |

Neither Rotten Tomatoes nor Metacritic has a public API and both forbid scraping, so
Wikipedia is the only free source that legitimately names critics. The article is
resolved through Wikidata by IMDb id (property `P345`), never by title — no film can
pick up another film's reviews. See `lib/wikipedia.ts`.

### Motion

Motion is **on by default**, with Settings → Appearance offering Full motion / Match
system / Still.

Following `prefers-reduced-motion` by default is the textbook choice and was the wrong
one here. Windows sets that flag for the whole machine under Visual Effects → **Adjust
for best performance** — a performance checkbox, not an accessibility one — and the
result was that the poster wall, both hero sliders and the rail scrolling rendered as
still images for anyone who had ever touched it, with no clue as to why. "Match system"
is one click away for anyone who wants the OS to decide.

The preference is stamped onto `<html>` as `data-motion` by `app/page.tsx`, because half
these animations are CSS and CSS can only see the media query.

What that attribute gates is one rule: the blanket
`animation-duration: 0.01ms !important` reduced-motion reset at the bottom of
`globals.css`. It is the most powerful rule in the file — it collapses every CSS
animation and transition in the app — and while it was ungated, "Full motion" only
half-worked: GSAP and Framer honoured the setting, but the hero pan, the staggered slide
copy, the dot timers and the poster edge light stayed frozen. Per-selector gates could
not undo it, because `!important` on `*` beats an ordinary declaration however specific.
Scoping that one rule fixed all of them at once.

Worth knowing if you add a CSS animation here: assert on its computed
`animation-duration`, not on `animation-name`. The name reads back correctly even when
the reset has flattened the duration to nothing, which is exactly how this went unnoticed.

### Quotes

The footer strip advances on its own and has no controls: it is a closing flourish, not
something to operate, and arrows on it made the footer look like a third carousel. It
still pauses while the pointer rests on it, which is not a control and is what WCAG 2.2.2
asks for.

### Posters and the hero

Every poster carries a light travelling around its edge — a conic gradient on a
pseudo-element masked down to its own padding box, which is the only way to get a
gradient border that follows the card's `border-radius`. The sweep animates a
`--cs-edge-angle` registered through `@property`; without that registration the browser
treats the value as a string and snaps from 0° to 360° with nothing in between. Rings are
phase-offset from a hash of the item's key, so a rail doesn't pulse in unison and there is
no hydration mismatch from `Math.random()`.

The Discover hero sits on its own opaque base layer. It had none, and its artwork sits
below full opacity, so the remaining fraction was the poster wall showing through the
banner — survivable while the wall was rendering at ~15% visibility, obvious once it
wasn't.

### The backdrop

The poster wall behind every tab is twelve independent marquee columns on a single
`gsap.ticker` pass: pointer parallax, an autonomous drift, a scroll-linked shift, a
screen-blended spotlight, per-column proximity lighting, and a timer that cross-fades
individual posters to titles the wall isn't showing.

It is worth knowing how it failed, because it failed the same way twice. Both times the
report was "the background posters don't appear at all", and both times the wall was in
the DOM with every image loaded and animating — at 34% opacity under a scrim running
from 55% to 97% black, which is ~15% visibility at the centre of the screen and
effectively zero at the edges. Nothing was broken that a debugger would show. The fix
was the opacity/scrim balance in `globals.css`, and `scripts/verify-ux.js` now asserts
on the *product* of those numbers rather than on the element existing.

### Why tabs used to look like they reloaded

`page.tsx` keys its tab container on the active tab, so every switch unmounts the old tab
and mounts the new one. `useFetch` therefore started from nothing each time: skeletons, a
re-fetch, and every entrance animation replaying. Returning to a tab looked like the page
had reloaded — reported as "clicking the logo refreshes the page", which is the same code
path, since the logo selects Discover.

Nothing in the app has ever navigated: there is no `<a href>`, no router, and no
`location` write anywhere in it. `useFetch` now keeps a session-lived cache keyed by URL,
renders from it immediately and revalidates in the background, so a returning tab is
populated on the first frame. Loading branches consequently test `loading && !data` rather
than `loading` — testing `loading` alone reintroduces the flash.

## What was broken before

The rebuild exists because these couldn't be patched out of the old file cleanly:

- **Every card opened the same title.** `openDetails()` wrote into `#detailsTitle`,
  `#detailsPlot`, `#detailsPoster` and `#detailsMeta` — none of which existed — so the
  modal always showed its hardcoded Oppenheimer markup.
- **Sync was completely dead.** The UI posted to `/api/datastorePut` and
  `/api/datastoreMeta`; the server only routed `/api/stremio/*`. Every write 404'd.
- **CSV upload always parsed 0 items.** `text.split('\\n')` split on a literal
  backslash-n, and the field regex was escaped the same way, so the file was read as one
  line and only the header was consumed.
- **The whole app lived inside `<head>`.** `<body>` opened at line 4400 and held only two
  script tags.
- **Duplicate definitions fought each other.** `closeTrailer` and `openTrailerModal` were
  each defined twice; `playTrailer()` targeted a `#trailerIframe` that didn't exist, so
  trailers opened in a new tab.
- **Release Tracker and Settings were unreachable on desktop** — no nav links existed.
- ~2,300 lines of CSS with up to five conflicting definitions of the same class.

## Verify

```bash
npm run build     # types + lint
npm run dev
```

Five Puppeteer suites live in `scripts/` — see `scripts/README.md` for how to run them.

Then, by hand: click three different posters and confirm three different titles; upload an
IMDb CSV export and confirm a non-zero item count; connect a Stremio account and run a
sync, watching for `POST /api/stremio/datastorePut` returning 200.
