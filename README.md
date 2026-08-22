# CineSync

Discover movies, anime and Arabic cinema, then sync your IMDb watchlist into your Stremio
library.

A Next.js rebuild of the original single-file `index.html` + `server.js` app that lived in
`../imdb to stremio`. Same OLED-black/emerald design, now seven tabs — rebuilt so the
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
| My Library | your connected sources → Stremio `datastorePut` |
| Settings | `localStorage` |

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
these animations are CSS and CSS can only see the media query. `globals.css` gates on
that attribute; see the block beside the reduced-motion media query.

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

Three Puppeteer suites live in `scripts/` — see `scripts/README.md` for how to run them.

Then, by hand: click three different posters and confirm three different titles; upload an
IMDb CSV export and confirm a non-zero item count; connect a Stremio account and run a
sync, watching for `POST /api/stremio/datastorePut` returning 200.
